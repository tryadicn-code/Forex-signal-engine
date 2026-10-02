import type {
  AnalysisContext,
  PipelineResult,
} from "@/core/orchestrator/types";
import { analyzeStructure } from "@/core/structure";
import { classifyRegime } from "@/core/regime";
import {
  getImplementedStrategy,
  IMPLEMENTED_STRATEGY_IDS,
} from "@/core/strategies/registry";
import {
  routeStrategy,
  type StrategyRoutingDecision,
} from "@/core/strategies/router";
import { qualifyReversal } from "@/core/strategies/reversal";

export interface RoutedAnalysisResult {
  routing: StrategyRoutingDecision;
  pipeline: PipelineResult;
}

/**
 * Regime-adaptive orchestrator.
 *
 * Phase 12.3 introduces strategy routing without changing the audited trading
 * behaviour. The router classifies the bias-timeframe regime, chooses the
 * preferred strategy, then resolves it against the audited strategy registry.
 * Reversal routing is deliberately conditional: HIGH_VOLATILITY alone does
 * not select REVERSAL. A qualified exhaustion sweep + fresh CHOCH is required.
 */
export function analyzeMarketWithRouting(
  context: AnalysisContext
): RoutedAnalysisResult {
  const pipSize = context.instrument.pipSize;
  const biasAsOf = context.biasTimeframe.snapshot.asOf;

  // Routing preflight uses the exact same structure/regime engines and market
  // inputs as the current strategy. It is decision metadata only.
  const routingStructure = analyzeStructure(
    context.biasTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    biasAsOf
  );
  const routingRegime = classifyRegime(
    context.biasTimeframe.snapshot.candles,
    routingStructure.data,
    context.configOverrides,
    biasAsOf
  );

  const reversalQualification = qualifyReversal({
    candles: context.biasTimeframe.snapshot.candles,
    structure: routingStructure.data,
    regime: routingRegime.data,
    pipSize,
    coreConfigOverrides: context.configOverrides,
  });

  const routing = routeStrategy(
    routingRegime,
    IMPLEMENTED_STRATEGY_IDS,
    { reversalQualification }
  );

  if (routing.selectedStrategyId === null) {
    return {
      routing,
      pipeline: buildNoStrategyPipeline(
        context,
        routingStructure,
        routingRegime,
        routing
      ),
    };
  }

  const strategy = getImplementedStrategy(routing.selectedStrategyId);
  if (strategy === null) {
    throw new Error(
      `Strategy Router selected ${routing.selectedStrategyId}, but no audited implementation is registered.`
    );
  }

  return {
    routing,
    pipeline: strategy.analyze(context),
  };
}

/**
 * Backward-compatible entrypoint used by existing consumers.
 *
 * The public return value remains PipelineResult. Call analyzeMarketWithRouting
 * when routing metadata is also required.
 */
export function analyzeMarket(context: AnalysisContext): PipelineResult {
  return analyzeMarketWithRouting(context).pipeline;
}

export type {
  AnalysisContext,
  PipelineResult,
  TimeframeInput,
} from "@/core/orchestrator/types";


function buildNoStrategyPipeline(
  context: AnalysisContext,
  structure: PipelineResult["structure"],
  regime: PipelineResult["regime"],
  routing: StrategyRoutingDecision
): PipelineResult {
  const setupTimeframe = context.setupTimeframe ?? context.biasTimeframe;
  const setupStructure = analyzeStructure(
    setupTimeframe.snapshot.candles,
    context.configOverrides,
    context.instrument.pipSize,
    setupTimeframe.snapshot.asOf
  );

  const evidence = [{
    code: routing.reasonCode,
    label: "Strategy router wait",
    description: routing.reason,
    value: routing.regime,
  }];

  const bias: PipelineResult["bias"] = {
    status: "BIAS_NEUTRAL",
    score: 0,
    confidence: 0,
    evidence,
    conflicts: [],
    data: {
      label: "NEUTRAL",
      direction: "NEUTRAL",
      score: 0,
      components: {
        structure: 0,
        trend: 0,
        regime: 0,
        momentum: 0,
      },
      weights: {
        structure: 0,
        trend: 0,
        regime: 0,
        momentum: 0,
      },
    },
    timestamp: regime.timestamp,
  };

  const setup: PipelineResult["setup"] = {
    status: "SETUP_NONE",
    score: 0,
    evidence,
    conflicts: [],
    data: {
      state: "NONE",
      zoneLow: 0,
      zoneHigh: 0,
      distanceToZone: 0,
      setupType: "router-wait",
      setupScore: 0,
      invalidationLevel: 0,
      zoneSource: "strategy-router",
    },
    timestamp: regime.timestamp,
  };

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
