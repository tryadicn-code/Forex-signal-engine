import type { RegimeLabel } from "@/types/market";
import type { StrategyId } from "@/core/strategies/types";

export type StrategyRoutingPolicyTarget =
  | StrategyId
  | "WAIT"
  | "CONDITIONAL_REVERSAL";

export interface StrategySystemPolicy {
  protocol: "phase-12-multistrategy-v1";
  implementedStrategyIds: StrategyId[];
  regimeRouting: Record<RegimeLabel, StrategyRoutingPolicyTarget>;
}

/**
 * Auditable system-level strategy policy.
 *
 * The router consumes this exact object and release governance snapshots it.
 * Therefore a future regime-routing change becomes an explicit release drift
 * instead of silently changing an already validated strategy release.
 */
export const STRATEGY_SYSTEM_POLICY: Readonly<StrategySystemPolicy> = {
  protocol: "phase-12-multistrategy-v1",
  implementedStrategyIds: [
    "TREND_PULLBACK",
    "BREAKOUT_RETEST",
    "RANGE_MEAN_REVERSION",
    "REVERSAL",
  ],
  regimeRouting: {
    STRONG_TREND_UP: "TREND_PULLBACK",
    TREND_UP: "TREND_PULLBACK",
    STRONG_TREND_DOWN: "TREND_PULLBACK",
    TREND_DOWN: "TREND_PULLBACK",
    BREAKOUT: "BREAKOUT_RETEST",
    RANGE: "RANGE_MEAN_REVERSION",
    LOW_VOLATILITY: "WAIT",
    HIGH_VOLATILITY: "CONDITIONAL_REVERSAL",
  },
};
