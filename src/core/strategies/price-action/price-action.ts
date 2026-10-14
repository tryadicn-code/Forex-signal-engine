import type { AnalysisContext, PipelineResult } from "@/core/orchestrator/types";
import type { StrategyDefinition } from "@/core/strategies/types";
import { analyzeStructure } from "@/core/structure";
import { classifyRegime } from "@/core/regime";
import { analyzeBias } from "@/core/bias";
import { evaluateRisk } from "@/core/risk";
import { classifyObstacle } from "@/core/risk/obstacle-classifier";
import { deriveStructuralTargetLevels } from "@/core/risk/structural-targets";
import { decide } from "@/core/execution";
import { resolveConfig } from "@/core/config/engine-config";
import { resolveEntryPrice } from "@/core/strategies/entry-price";
import { analyzePriceActionSetup } from "./setup";
import { evaluatePriceActionTrigger } from "./trigger";

export const PRICE_ACTION_STRATEGY_ID = "PRICE_ACTION" as const;

/**
 * PRICE_ACTION strategy (TRD-RR-006).
 *
 * MVP: dua keluarga (TREND_PULLBACK dan BREAKOUT_RETEST). REVERSAL disiapkan
 * sebagai slot dengan enableReversal=false.
 *
 * Hanya komponen EMA, Support/Resistance, Supply/Demand, dan Price Action.
 * Tidak ada RSI/MACD/ADX/volume sebagai syarat entry.
 *
 * Reuse: analyzeStructure, analyzeBias, classifyRegime, evaluateRisk,
 * classifyObstacle, deriveStructuralTargetLevels, decide, resolveEntryPrice.
 * Beda: setup dan trigger pakai modul price-action sendiri.
 */
export function analyzePriceAction(context: AnalysisContext): PipelineResult {
  const config = resolveConfig(context.configOverrides);
  const strategyConfig = context.strategyConfigOverrides?.priceAction;
  const { instrument, biasTimeframe } = context;
  const setupTimeframe = context.setupTimeframe ?? biasTimeframe;
  const triggerTimeframe = context.triggerTimeframe ?? setupTimeframe;
  const pipSize = instrument.pipSize;

  const biasAsOf = biasTimeframe.snapshot.asOf;
  const setupAsOf = setupTimeframe.snapshot.asOf;
  const triggerAsOf = triggerTimeframe.snapshot.asOf;

  // Structure + regime + bias reuse existing engines.
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

  const setupAnalysis = analyzePriceActionSetup({
    setupCandles: setupTimeframe.snapshot.candles,
    triggerCandles: triggerTimeframe.snapshot.candles,
    setupStructure: setupStructure.data,
    bias: bias.data,
    pipSize,
    coreConfigOverrides: context.configOverrides,
    strategyConfig,
    marketAsOf: setupAsOf,
  });
  const setup = setupAnalysis.result;

  if (
    setup.data.state === "NONE" ||
    setup.data.state === "INVALIDATED" ||
    bias.data.direction === "NEUTRAL"
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
  const triggerCandles =
    context.closedOnly === false
      ? triggerTimeframe.snapshot.candles.slice(0, -1)
      : triggerTimeframe.snapshot.candles;

  const trigger = evaluatePriceActionTrigger({
    triggerCandles,
    setup: setup.data,
    structure: triggerStructure.data,
    direction: bias.data.direction,
    coreConfigOverrides: context.configOverrides,
    strategyConfig,
    marketAsOf: triggerAsOf,
  });

  const entry = resolveEntryPrice(triggerCandles, setup.data, trigger.data);
  const explicitTargets =
    context.targetLevels && context.targetLevels.length > 0
      ? context.targetLevels
      : undefined;

  const structuralTargets = explicitTargets
    ? []
    : deriveStructuralTargetLevels({
        entry,
        direction: bias.data.direction,
        pipSize,
        setupStructure: setupStructure.data,
        biasStructure: undefined,
        bufferPips: config.risk.structuralTargetBufferPips,
      });

  const executionPlan = classifyObstacle({
    entry,
    stop: setup.data.invalidationLevel,
    direction: bias.data.direction,
    minRR: config.risk.minRR,
    minObstacleR: config.risk.minObstacleR,
    closeObstacleMaxR: config.risk.closeObstacleMaxR,
    obstaclePolicyEnabled: config.risk.obstaclePolicyEnabled,
    partialTP1SizePercent: config.risk.partialTP1SizePercent,
    partialTPEnabled: config.risk.partialTPEnabled,
    obstaclePrice: structuralTargets[0],
  });

  const risk =
    trigger.data.state === "CONFIRMED"
      ? evaluateRisk(
          {
            entry,
            stop: setup.data.invalidationLevel,
            accountBalance: context.accountBalance,
            accountCurrency: context.accountCurrency,
            riskPercent: context.riskPercent ?? config.risk.defaultRiskPercent,
            instrument,
            targetLevels: explicitTargets,
            executionPlan,
            direction: bias.data.direction,
            quoteToAccountConversionRate: context.quoteToAccountConversionRate,
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
      riskPercent: context.riskPercent ?? config.risk.defaultRiskPercent,
      ...context.execution,
      signalTimestamp:
        trigger.data.triggerTimestamp ?? context.execution?.signalTimestamp,
      regime: regime.data.regime,
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

export const PRICE_ACTION_STRATEGY: StrategyDefinition = {
  id: PRICE_ACTION_STRATEGY_ID,
  analyze: analyzePriceAction,
};