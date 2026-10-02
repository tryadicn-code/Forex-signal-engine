import { describe, expect, it } from "vitest";
import { routeStrategy } from "@/core/strategies/router";
import type { EngineResult, RegimeResultData } from "@/types/engine";
import type { RegimeLabel } from "@/types/market";
import type { StrategyId } from "@/core/strategies/types";
import { IMPLEMENTED_STRATEGY_IDS } from "@/core/strategies/registry";

function regime(
  label: RegimeLabel,
  strength = 60,
  confidence = 75
): EngineResult<RegimeResultData> {
  return {
    status: `REGIME_${label}`,
    score: strength,
    confidence,
    evidence: [],
    conflicts: [],
    data: {
      regime: label,
      baseRegime:
        label === "BREAKOUT"
          ? "BREAKOUT"
          : label.includes("TREND_UP")
            ? "TREND_UP"
            : label.includes("TREND_DOWN")
              ? "TREND_DOWN"
              : label === "HIGH_VOLATILITY"
                ? "HIGH_VOLATILITY"
                : label === "LOW_VOLATILITY"
                  ? "LOW_VOLATILITY"
                  : "RANGE",
      direction:
        label.includes("UP")
          ? "LONG"
          : label.includes("DOWN")
            ? "SHORT"
            : "NEUTRAL",
      strength,
      adx: 30,
      ema20: 1.1,
      ema50: 1.09,
      ema200: 1.08,
      atr: 0.001,
      bandWidthRatio: 1,
    },
    timestamp: new Date(0).toISOString(),
  };
}

describe("Phase 12.3 Market Regime -> Strategy Router", () => {
  it.each([
    "STRONG_TREND_UP",
    "TREND_UP",
    "STRONG_TREND_DOWN",
    "TREND_DOWN",
  ] as const)("routes %s directly to TREND_PULLBACK", (label) => {
    const decision = routeStrategy(regime(label), ["TREND_PULLBACK"]);

    expect(decision.preferredStrategyId).toBe("TREND_PULLBACK");
    expect(decision.selectedStrategyId).toBe("TREND_PULLBACK");
    expect(decision.mode).toBe("REGIME_MATCH");
    expect(decision.reasonCode).toBe("TREND_REGIME");
  });

  it("prefers BREAKOUT_RETEST for BREAKOUT but falls back while unavailable", () => {
    const decision = routeStrategy(regime("BREAKOUT"), ["TREND_PULLBACK"]);

    expect(decision.preferredStrategyId).toBe("BREAKOUT_RETEST");
    expect(decision.selectedStrategyId).toBe("TREND_PULLBACK");
    expect(decision.mode).toBe("COMPATIBILITY_FALLBACK");
    expect(decision.reasonCode).toBe("PREFERRED_STRATEGY_UNAVAILABLE");
  });

  it("prefers RANGE_MEAN_REVERSION for RANGE but falls back while unavailable", () => {
    const decision = routeStrategy(regime("RANGE"), ["TREND_PULLBACK"]);

    expect(decision.preferredStrategyId).toBe("RANGE_MEAN_REVERSION");
    expect(decision.selectedStrategyId).toBe("TREND_PULLBACK");
    expect(decision.mode).toBe("COMPATIBILITY_FALLBACK");
  });

  it("routes RANGE directly through the audited strategy registry", () => {
    const decision = routeStrategy(regime("RANGE"), IMPLEMENTED_STRATEGY_IDS);

    expect(IMPLEMENTED_STRATEGY_IDS).toContain("RANGE_MEAN_REVERSION");
    expect(decision.preferredStrategyId).toBe("RANGE_MEAN_REVERSION");
    expect(decision.selectedStrategyId).toBe("RANGE_MEAN_REVERSION");
    expect(decision.mode).toBe("REGIME_MATCH");
    expect(decision.reasonCode).toBe("RANGE_REGIME");
  });

  it.each([
    ["LOW_VOLATILITY", "LOW_VOLATILITY_WAIT"],
    ["HIGH_VOLATILITY", "HIGH_VOLATILITY_WAIT"],
  ] as const)("treats %s as WAIT preference, not an invented reversal signal", (label, code) => {
    const decision = routeStrategy(regime(label), ["TREND_PULLBACK"]);

    expect(decision.preferredStrategyId).toBeNull();
    expect(decision.selectedStrategyId).toBeNull();
    expect(decision.mode).toBe("NO_STRATEGY");
    expect(decision.reasonCode).toBe(code);
  });

  it("selects a future strategy directly once it is declared available", () => {
    const available: StrategyId[] = ["TREND_PULLBACK", "BREAKOUT_RETEST"];
    const decision = routeStrategy(regime("BREAKOUT"), available);

    expect(decision.preferredStrategyId).toBe("BREAKOUT_RETEST");
    expect(decision.selectedStrategyId).toBe("BREAKOUT_RETEST");
    expect(decision.mode).toBe("REGIME_MATCH");
    expect(decision.reasonCode).toBe("BREAKOUT_REGIME");
  });

  it("routes BREAKOUT directly through the audited strategy registry", () => {
    const decision = routeStrategy(
      regime("BREAKOUT"),
      IMPLEMENTED_STRATEGY_IDS
    );

    expect(IMPLEMENTED_STRATEGY_IDS).toContain("BREAKOUT_RETEST");
    expect(decision.preferredStrategyId).toBe("BREAKOUT_RETEST");
    expect(decision.selectedStrategyId).toBe("BREAKOUT_RETEST");
    expect(decision.mode).toBe("REGIME_MATCH");
  });

  it("routes qualified HIGH_VOLATILITY transition to REVERSAL", () => {
    const decision = routeStrategy(
      regime("HIGH_VOLATILITY"),
      IMPLEMENTED_STRATEGY_IDS,
      {
        reversalQualification: {
          qualified: true,
          reasonCode: "REVERSAL_QUALIFIED",
          reason: "Fresh CHOCH followed exhaustion sweep.",
        },
      }
    );

    expect(IMPLEMENTED_STRATEGY_IDS).toContain("REVERSAL");
    expect(decision.preferredStrategyId).toBe("REVERSAL");
    expect(decision.selectedStrategyId).toBe("REVERSAL");
    expect(decision.mode).toBe("REGIME_MATCH");
    expect(decision.reasonCode).toBe("REVERSAL_TRANSITION");
  });

  it("keeps HIGH_VOLATILITY out of REVERSAL when transition qualification fails", () => {
    const decision = routeStrategy(
      regime("HIGH_VOLATILITY"),
      IMPLEMENTED_STRATEGY_IDS,
      {
        reversalQualification: {
          qualified: false,
          reasonCode: "REVERSAL_SWEEP_MISSING",
          reason: "No exhaustion sweep.",
        },
      }
    );

    expect(decision.preferredStrategyId).toBeNull();
    expect(decision.selectedStrategyId).toBeNull();
    expect(decision.mode).toBe("NO_STRATEGY");
    expect(decision.reasonCode).toBe("HIGH_VOLATILITY_WAIT");
  });

  it("returns NO_STRATEGY rather than inventing an implementation", () => {
    const decision = routeStrategy(regime("RANGE"), []);

    expect(decision.preferredStrategyId).toBe("RANGE_MEAN_REVERSION");
    expect(decision.selectedStrategyId).toBeNull();
    expect(decision.mode).toBe("NO_STRATEGY");
    expect(decision.reasonCode).toBe("NO_AVAILABLE_STRATEGY");
  });

  it("preserves regime strength and confidence for explainability", () => {
    const decision = routeStrategy(regime("TREND_UP", 82, 91), ["TREND_PULLBACK"]);

    expect(decision.regimeStrength).toBe(82);
    expect(decision.regimeConfidence).toBe(91);
  });
});
