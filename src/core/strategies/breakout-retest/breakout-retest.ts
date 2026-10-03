import type { AnalysisContext, PipelineResult } from "@/core/orchestrator/types";
import type { StrategyDefinition } from "@/core/strategies/types";
import { analyzeStructure } from "@/core/structure";
import { classifyRegime } from "@/core/regime";
import { analyzeBias } from "@/core/bias";
import { evaluateRisk } from "@/core/risk";
import { deriveStructuralTargetLevels } from "@/core/risk/structural-targets";
import { decide } from "@/core/execution";
import { resolveConfig } from "@/core/config/engine-config";
import { last } from "@/core/indicators";
import { resolveEntryPrice } from "@/core/strategies/entry-price";
import { analyzeBreakoutRetestSetup } from "./setup";
import { evaluateBreakoutRetestTrigger } from "./trigger";
import { modeAwareConfirmationAgeOverride } from "@/core/strategies/runtime-limits";

export const BREAKOUT_RETEST_STRATEGY_ID = "BREAKOUT_RETEST" as const;

/**
 * BREAKOUT_RETEST strategy.
 *
 * H4 decides whether the market is genuinely in BREAKOUT regime and provides
 * directional bias. H1 identifies the confirmed broken structure level. M15
 * must then retest that level, hold it, and print fresh structure back in the
 * breakout direction. Only after that does the shared Risk/Execution safety
 * pipeline become eligible.
 *
 * The strategy explicitly refuses breakout chasing: an expansion candle by
 * itself can never produce a confirmed trigger.
 */
export function analyzeBreakoutRetest(
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
  const bias = analyzeBias(
    biasTimeframe.snapshot.candles,
    structure.data,
    regime.data,
    context.configOverrides,
    biasAsOf
  );

  const setupStructure = analyzeStructure(
    setupTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    setupAsOf
  );

  const setupAnalysis = analyzeBreakoutRetestSetup({
    setupCandles: setupTimeframe.snapshot.candles,
    triggerCandles: triggerTimeframe.snapshot.candles,
    setupStructure: setupStructure.data,
    regime: regime.data,
    bias: bias.data,
    pipSize,
    coreConfigOverrides: context.configOverrides,
    strategyConfig: context.strategyConfigOverrides?.breakoutRetest,
    marketAsOf: setupAsOf,
  });
  const setup = setupAnalysis.result;

  if (
    setup.data.state === "NONE" ||
    setup.data.state === "INVALIDATED" ||
    bias.data.direction === "NEUTRAL" ||
    setupAnalysis.breakout === null
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

  const triggerStructure = analyzeStructure(
    triggerTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    triggerAsOf
  );

  // C2: scanner delivers closed-only snapshots. Only strip the last bar when
  // the caller explicitly says it may still be forming (closedOnly === false).
  const triggerCandles =
    context.closedOnly === false
      ? triggerTimeframe.snapshot.candles.slice(0, -1)
      : triggerTimeframe.snapshot.candles;
  const trigger = evaluateBreakoutRetestTrigger({
    candles: triggerCandles,
    setup: setup.data,
    structure: triggerStructure.data,
    direction: bias.data.direction,
    breakout: setupAnalysis.breakout,
    coreConfigOverrides: context.configOverrides,
    strategyConfig: {
      ...context.strategyConfigOverrides?.breakoutRetest,
      ...modeAwareConfirmationAgeOverride(context.execution?.mode),
    },
    marketAsOf: triggerAsOf,
  });

  const entry = resolveEntryPrice(triggerCandles, setup.data, trigger.data);

  const explicitTargets =
    context.targetLevels && context.targetLevels.length > 0
      ? context.targetLevels
      : undefined;

  // Breakout trades still respect known structure ahead. A nearby obstacle is
  // passed into the shared Risk Engine so the same minimum-RR rule can reject
  // a breakout whose remaining room is insufficient.
  const structuralTargets = explicitTargets
    ? []
    : deriveStructuralTargetLevels({
        entry,
        direction: bias.data.direction,
        pipSize,
        setupStructure: setupStructure.data,
        biasStructure: structure.data,
        bufferPips: config.risk.structuralTargetBufferPips,
      });

  const minimumTargetDistance =
    Math.abs(entry - setup.data.invalidationLevel) * config.risk.minRR;
  const nearestStructuralTarget = structuralTargets[0];
  const targetLevelsForRisk = explicitTargets
    ? explicitTargets
    : nearestStructuralTarget !== undefined &&
        Math.abs(nearestStructuralTarget - entry) < minimumTargetDistance
      ? [nearestStructuralTarget]
      : undefined;

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
            targetLevels: targetLevelsForRisk,
            direction: bias.data.direction,
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

export const BREAKOUT_RETEST_STRATEGY: StrategyDefinition = {
  id: BREAKOUT_RETEST_STRATEGY_ID,
  analyze: analyzeBreakoutRetest,
};
