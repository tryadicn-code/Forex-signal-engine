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
 * Until future strategies are implemented, non-trend regimes explicitly use
 * the TREND_PULLBACK compatibility fallback.
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

  const routing = routeStrategy(
    routingRegime,
    IMPLEMENTED_STRATEGY_IDS
  );

  if (routing.selectedStrategyId === null) {
    throw new Error(
      `Strategy Router produced no executable strategy for regime ${routing.regime}.`
    );
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
