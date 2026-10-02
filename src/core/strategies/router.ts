import type {
  EngineResult,
  RegimeResultData,
} from "@/types/engine";
import type { RegimeLabel } from "@/types/market";
import type { StrategyId } from "@/core/strategies/types";
import {
  STRATEGY_SYSTEM_POLICY,
  type StrategyRoutingPolicyTarget,
} from "@/core/strategies/system-policy";

export type StrategyRoutingMode =
  | "REGIME_MATCH"
  | "COMPATIBILITY_FALLBACK"
  | "NO_STRATEGY";

export interface StrategyRoutingContext {
  reversalQualification?: {
    qualified: boolean;
    reasonCode: string;
    reason: string;
  } | null;
}

export interface StrategyRoutingDecision {
  regime: RegimeLabel;
  regimeStrength: number;
  regimeConfidence: number | null;
  preferredStrategyId: StrategyId | null;
  selectedStrategyId: StrategyId | null;
  mode: StrategyRoutingMode;
  reasonCode: StrategyRoutingReasonCode;
  reason: string;
}

export type StrategyRoutingReasonCode =
  | "TREND_REGIME"
  | "BREAKOUT_REGIME"
  | "RANGE_REGIME"
  | "LOW_VOLATILITY_WAIT"
  | "HIGH_VOLATILITY_WAIT"
  | "REVERSAL_TRANSITION"
  | "PREFERRED_STRATEGY_UNAVAILABLE"
  | "NO_AVAILABLE_STRATEGY";

/**
 * Pure Market Regime -> Strategy Router.
 *
 * The router decides suitability only. It never changes strategy thresholds,
 * generates entries, sizes risk, or executes orders.
 *
 * The registry grows one audited strategy at a time. When a regime prefers a
 * strategy that has not been implemented yet, the decision records that
 * preference explicitly and may select TREND_PULLBACK as a compatibility
 * fallback. A deliberate WAIT preference (no preferred strategy) is fail-closed
 * as NO_STRATEGY and never falls through to TREND_PULLBACK.
 * Implemented strategies are selected directly as REGIME_MATCH.
 */
export function routeStrategy(
  regimeResult: EngineResult<RegimeResultData>,
  availableStrategyIds: readonly StrategyId[],
  context: StrategyRoutingContext = {}
): StrategyRoutingDecision {
  const preferred = preferredStrategyForRegime(
    regimeResult.data.regime,
    context
  );
  const availability = new Set(availableStrategyIds);
  const confidence = regimeResult.confidence ?? null;

  if (preferred.strategyId !== null && availability.has(preferred.strategyId)) {
    return {
      regime: regimeResult.data.regime,
      regimeStrength: regimeResult.data.strength,
      regimeConfidence: confidence,
      preferredStrategyId: preferred.strategyId,
      selectedStrategyId: preferred.strategyId,
      mode: "REGIME_MATCH",
      reasonCode: preferred.reasonCode,
      reason: preferred.reason,
    };
  }

  if (preferred.strategyId === null) {
    return {
      regime: regimeResult.data.regime,
      regimeStrength: regimeResult.data.strength,
      regimeConfidence: confidence,
      preferredStrategyId: null,
      selectedStrategyId: null,
      mode: "NO_STRATEGY",
      reasonCode: preferred.reasonCode,
      reason: preferred.reason,
    };
  }

  if (availability.has("TREND_PULLBACK")) {
    const preferredLabel =
      preferred.strategyId === null ? "no active strategy" : preferred.strategyId;
    return {
      regime: regimeResult.data.regime,
      regimeStrength: regimeResult.data.strength,
      regimeConfidence: confidence,
      preferredStrategyId: preferred.strategyId,
      selectedStrategyId: "TREND_PULLBACK",
      mode: "COMPATIBILITY_FALLBACK",
      reasonCode:
        preferred.strategyId === null
          ? preferred.reasonCode
          : "PREFERRED_STRATEGY_UNAVAILABLE",
      reason:
        preferred.strategyId === null
          ? `${preferred.reason} TREND_PULLBACK remains active only as the Phase 12.3 compatibility fallback.`
          : `Regime prefers ${preferredLabel}, but it is not implemented yet. TREND_PULLBACK remains active as the audited compatibility fallback.`,
    };
  }

  return {
    regime: regimeResult.data.regime,
    regimeStrength: regimeResult.data.strength,
    regimeConfidence: confidence,
    preferredStrategyId: preferred.strategyId,
    selectedStrategyId: null,
    mode: "NO_STRATEGY",
    reasonCode: "NO_AVAILABLE_STRATEGY",
    reason: "No audited strategy implementation is available for this routing decision.",
  };
}

function preferredStrategyForRegime(
  regime: RegimeLabel,
  context: StrategyRoutingContext
): {
  strategyId: StrategyId | null;
  reasonCode: Exclude<
    StrategyRoutingReasonCode,
    "PREFERRED_STRATEGY_UNAVAILABLE" | "NO_AVAILABLE_STRATEGY"
  >;
  reason: string;
} {
  const target: StrategyRoutingPolicyTarget =
    STRATEGY_SYSTEM_POLICY.regimeRouting[regime];

  switch (target) {
    case "TREND_PULLBACK":
      return {
        strategyId: "TREND_PULLBACK",
        reasonCode: "TREND_REGIME",
        reason: `${regime} is a directional trend regime; prefer pullback continuation.`,
      };

    case "BREAKOUT_RETEST":
      return {
        strategyId: "BREAKOUT_RETEST",
        reasonCode: "BREAKOUT_REGIME",
        reason:
          "BREAKOUT regime prefers breakout/retest continuation instead of chasing the expansion candle.",
      };

    case "RANGE_MEAN_REVERSION":
      return {
        strategyId: "RANGE_MEAN_REVERSION",
        reasonCode: "RANGE_REGIME",
        reason:
          "RANGE regime prefers mean reversion at validated range boundaries.",
      };

    case "WAIT":
      return {
        strategyId: null,
        reasonCode: "LOW_VOLATILITY_WAIT",
        reason:
          "LOW_VOLATILITY is treated as compression; wait for expansion or a clearer range before selecting a strategy.",
      };

    case "CONDITIONAL_REVERSAL":
      if (context.reversalQualification?.qualified) {
        return {
          strategyId: "REVERSAL",
          reasonCode: "REVERSAL_TRANSITION",
          reason: context.reversalQualification.reason,
        };
      }
      return {
        strategyId: null,
        reasonCode: "HIGH_VOLATILITY_WAIT",
        reason:
          context.reversalQualification?.reason ??
          "HIGH_VOLATILITY alone is not sufficient evidence for reversal; wait for a qualified transition/exhaustion setup.",
      };

    case "REVERSAL":
      // The current policy intentionally uses CONDITIONAL_REVERSAL rather than
      // unconditional REVERSAL. Keep this branch fail-closed if a future policy
      // is malformed.
      return {
        strategyId: null,
        reasonCode: "HIGH_VOLATILITY_WAIT",
        reason:
          "Unconditional REVERSAL routing is not permitted by the Phase 12 policy.",
      };
  }
}
