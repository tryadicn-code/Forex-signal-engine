import {
  TREND_PULLBACK_STRATEGY,
} from "@/core/strategies/trend-pullback";
import {
  BREAKOUT_RETEST_STRATEGY,
} from "@/core/strategies/breakout-retest";
import {
  RANGE_MEAN_REVERSION_STRATEGY,
} from "@/core/strategies/range-mean-reversion";
import type {
  ImplementedStrategyId,
  StrategyDefinition,
  StrategyId,
} from "@/core/strategies/types";

const REGISTRY: Readonly<Record<ImplementedStrategyId, StrategyDefinition>> = {
  TREND_PULLBACK: TREND_PULLBACK_STRATEGY,
  BREAKOUT_RETEST: BREAKOUT_RETEST_STRATEGY,
  RANGE_MEAN_REVERSION: RANGE_MEAN_REVERSION_STRATEGY,
};

export const IMPLEMENTED_STRATEGY_IDS =
  Object.freeze(Object.keys(REGISTRY) as ImplementedStrategyId[]);

export function isStrategyImplemented(
  strategyId: StrategyId
): strategyId is ImplementedStrategyId {
  return strategyId in REGISTRY;
}

export function getImplementedStrategy(
  strategyId: StrategyId
): StrategyDefinition | null {
  return isStrategyImplemented(strategyId) ? REGISTRY[strategyId] : null;
}
