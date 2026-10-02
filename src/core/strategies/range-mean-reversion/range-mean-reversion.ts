import type { AnalysisContext, PipelineResult } from "@/core/orchestrator/types";
import type { StrategyDefinition } from "@/core/strategies/types";
import { analyzeStructure } from "@/core/structure";
import { classifyRegime } from "@/core/regime";
import { evaluateRisk } from "@/core/risk";
import { decide } from "@/core/execution";
import { resolveConfig } from "@/core/config/engine-config";
import { last } from "@/core/indicators";
import { analyzeRangeMeanReversionSetup } from "./setup";
import { evaluateRangeMeanReversionTrigger } from "./trigger";

export const RANGE_MEAN_REVERSION_STRATEGY_ID =
  "RANGE_MEAN_REVERSION" as const;

/**
 * RANGE_MEAN_REVERSION strategy.
 *
 * H4 must classify as RANGE. H1 validates repeated horizontal boundaries and
 * derives direction from location only. M15 must reject the active edge and
 * then print fresh structure back toward the mean. Risk is evaluated against
 * TP1 at the range midpoint and TP2 near the opposite boundary, so a setup
 * whose midpoint cannot satisfy the shared minimum-RR gate is rejected.
 */
export function analyzeRangeMeanReversion(
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
  const setupStructure = analyzeStructure(
    setupTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    setupAsOf
  );

  const setupAnalysis = analyzeRangeMeanReversionSetup({
    setupCandles: setupTimeframe.snapshot.candles,
    setupStructure: setupStructure.data,
    regime: regime.data,
    pipSize,
    coreConfigOverrides: context.configOverrides,
    marketAsOf: setupAsOf,
  });
  const setup = setupAnalysis.setup;
  const bias = setupAnalysis.bias;
  const range = setupAnalysis.range;

  if (
    range === null ||
    range.direction === "NEUTRAL" ||
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

  const triggerStructure = analyzeStructure(
    triggerTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    triggerAsOf
  );
  const trigger = evaluateRangeMeanReversionTrigger({
    candles: triggerTimeframe.snapshot.candles,
    setup: setup.data,
    range,
    structure: triggerStructure.data,
    direction: range.direction,
    coreConfigOverrides: context.configOverrides,
    marketAsOf: triggerAsOf,
  });

  const entry =
    last(triggerTimeframe.snapshot.candles.map((c) => c.close)) ??
    (setup.data.zoneLow + setup.data.zoneHigh) / 2;

  const oppositeBoundaryTarget =
    range.direction === "LONG"
      ? range.upperBoundary - config.risk.structuralTargetBufferPips * pipSize
      : range.lowerBoundary + config.risk.structuralTargetBufferPips * pipSize;
  const rangeTargets = [range.midpoint, oppositeBoundaryTarget];
  const targetLevels =
    context.targetLevels && context.targetLevels.length > 0
      ? context.targetLevels
      : rangeTargets;

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
            direction: range.direction,
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

export const RANGE_MEAN_REVERSION_STRATEGY: StrategyDefinition = {
  id: RANGE_MEAN_REVERSION_STRATEGY_ID,
  analyze: analyzeRangeMeanReversion,
};
