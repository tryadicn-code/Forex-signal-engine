import type { AnalysisContext, PipelineResult } from "@/core/orchestrator/types";
import type { StrategyDefinition } from "@/core/strategies/types";
import { analyzeStructure } from "@/core/structure";
import { classifyRegime } from "@/core/regime";
import { evaluateRisk } from "@/core/risk";
import { deriveStructuralTargetLevels } from "@/core/risk/structural-targets";
import { decide } from "@/core/execution";
import { resolveConfig } from "@/core/config/engine-config";
import { last } from "@/core/indicators";
import { resolveEntryPrice } from "@/core/strategies/entry-price";
import { qualifyReversal } from "./qualification";
import { analyzeReversalSetup } from "./setup";
import { evaluateReversalTrigger } from "./trigger";

export const REVERSAL_STRATEGY_ID = "REVERSAL" as const;

/**
 * REVERSAL strategy.
 *
 * This strategy never tries to call a top/bottom from volatility alone.
 * Eligibility requires a qualified H4 exhaustion sweep followed by a fresh
 * confirmed CHOCH. H1/M15 then have to retest that transition and confirm the
 * new direction before shared Risk/Execution can approve anything.
 */
export function analyzeReversal(
  context: AnalysisContext
): PipelineResult {
  const config = resolveConfig(context.configOverrides);
  const { instrument, biasTimeframe } = context;
  const setupTimeframe = context.setupTimeframe ?? biasTimeframe;
  const triggerTimeframe = context.triggerTimeframe ?? setupTimeframe;
  const pipSize = instrument.pipSize;

  const biasAsOf = biasTimeframe.snapshot.asOf;
  const setupAsOf = setupTimeframe.snapshot.asOf;
  const triggerAsOf = triggerTimeframe.snapshot.asOf;

  const structure = analyzeStructure(
    biasTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    biasAsOf
  );
  const regime = classifyRegime(
    biasTimeframe.snapshot.candles,
    structure.data,
    context.configOverrides,
    biasAsOf
  );
  const qualification = qualifyReversal({
    candles: biasTimeframe.snapshot.candles,
    structure: structure.data,
    regime: regime.data,
    pipSize,
    coreConfigOverrides: context.configOverrides,
    strategyConfig: context.strategyConfigOverrides?.reversal,
  });

  const setupStructure = analyzeStructure(
    setupTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    setupAsOf
  );

  const setupAnalysis = analyzeReversalSetup({
    setupCandles: setupTimeframe.snapshot.candles,
    triggerCandles: triggerTimeframe.snapshot.candles,
    qualification,
    pipSize,
    coreConfigOverrides: context.configOverrides,
    strategyConfig: context.strategyConfigOverrides?.reversal,
    marketAsOf: setupAsOf,
  });
  const setup = setupAnalysis.setup;
  const bias = setupAnalysis.bias;

  if (
    !qualification.qualified ||
    qualification.direction === "NEUTRAL" ||
    bias.data.direction === "NEUTRAL" ||
    setup.data.state === "NONE" ||
    setup.data.state === "WATCH" ||
    setup.data.state === "INVALIDATED"
  ) {
    return {
      structure,
      regime,
      bias,
      setup,
      setupStructure,
      trigger: null,
      risk: null,
      execution: null,
    };
  }

  const direction = qualification.direction;
  const triggerStructure = analyzeStructure(
    triggerTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    triggerAsOf
  );
  const trigger = evaluateReversalTrigger({
    candles: triggerTimeframe.snapshot.candles,
    setup: setup.data,
    structure: triggerStructure.data,
    direction,
    qualification,
    coreConfigOverrides: context.configOverrides,
    strategyConfig: context.strategyConfigOverrides?.reversal,
    marketAsOf: triggerAsOf,
  });

  const entry =
    last(triggerTimeframe.snapshot.candles.map((c) => c.close)) ??
    (setup.data.zoneLow + setup.data.zoneHigh) / 2;

  const explicitTargets =
    context.targetLevels && context.targetLevels.length > 0
      ? context.targetLevels
      : undefined;
  const structuralTargets = explicitTargets
    ? []
    : deriveStructuralTargetLevels({
        entry,
        direction,
        pipSize,
        setupStructure: setupStructure.data,
        biasStructure: structure.data,
        bufferPips: config.risk.structuralTargetBufferPips,
      });
  const targetLevels =
    explicitTargets ??
    (structuralTargets.length > 0 ? structuralTargets : undefined);

  const risk =
    trigger.data.state === "CONFIRMED"
      ? evaluateRisk(
          {
            entry,
            stop: setup.data.invalidationLevel,
            accountBalance: context.accountBalance,
            accountCurrency: context.accountCurrency,
            riskPercent:
              context.riskPercent ?? config.risk.defaultRiskPercent,
            instrument,
            targetLevels,
            direction,
            quoteToAccountConversionRate:
              context.quoteToAccountConversionRate,
            marketAsOf: triggerAsOf,
          },
          context.configOverrides
        )
      : null;

  const now = context.execution?.now ?? triggerAsOf;
  const execution = decide({
    bias: bias.data,
    setup: setup.data,
    trigger: trigger.data,
    risk: risk?.data ?? null,
    context: {
      now,
      riskPercent:
        context.riskPercent ?? config.risk.defaultRiskPercent,
      ...context.execution,
      signalTimestamp:
        trigger.data.triggerTimestamp ??
        context.execution?.signalTimestamp,
    },
    snapshot: triggerTimeframe.snapshot,
    configOverrides: context.configOverrides,
    vetoes: context.vetoes,
  });

  return {
    structure,
    regime,
    bias,
    setup,
    setupStructure,
    trigger,
    risk,
    execution,
  };
}

export const REVERSAL_STRATEGY: StrategyDefinition = {
  id: REVERSAL_STRATEGY_ID,
  analyze: analyzeReversal,
};
