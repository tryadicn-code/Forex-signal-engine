import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignalExecutiveSummary } from "@/components/signals/signal-executive-summary";
import {
  failureResult,
  type SymbolScanResult,
} from "@/scanner/scanner-result";

function result(): SymbolScanResult {
  return {
    ...failureResult("EURUSD", "PROVIDER_FAILURE", "seed", 1),
    status: "ANALYSED",
    reason: "Analysed successfully.",
    latestPrice: 1.1,
    regime: "BREAKOUT",
    strategyId: "TREND_PULLBACK",
    strategyRouting: {
      regime: "BREAKOUT",
      regimeStrength: 72,
      regimeConfidence: 84,
      preferredStrategyId: "BREAKOUT_RETEST",
      selectedStrategyId: "TREND_PULLBACK",
      mode: "COMPATIBILITY_FALLBACK",
      reasonCode: "PREFERRED_STRATEGY_UNAVAILABLE",
      reason:
        "Regime prefers BREAKOUT_RETEST, but it is not implemented yet. TREND_PULLBACK remains active as the audited compatibility fallback.",
    },
    bias: "LONG",
    biasScore: 65,
    biasDirection: "LONG",
    setupState: "WATCH",
    setupScore: 58,
    triggerState: "WAITING",
    triggerScore: 50,
    freshness: "FRESH",
  };
}

describe("Phase 12.3 strategy routing UI", () => {
  it("shows regime, preferred strategy, active strategy, and fallback mode", () => {
    render(<SignalExecutiveSummary result={result()} />);

    const routing = screen.getByLabelText("Strategy routing");
    expect(routing).toHaveTextContent("BREAKOUT");
    expect(routing).toHaveTextContent("BREAKOUT_RETEST");
    expect(routing).toHaveTextContent("TREND_PULLBACK");
    expect(routing).toHaveTextContent("COMPATIBILITY_FALLBACK");
    expect(
      screen.getByText(/not implemented yet/i)
    ).toBeInTheDocument();
  });

  it("does not show a fallback warning for a direct regime match", () => {
    const direct = result();
    direct.regime = "TREND_UP";
    direct.strategyRouting = {
      regime: "TREND_UP",
      regimeStrength: 70,
      regimeConfidence: 88,
      preferredStrategyId: "TREND_PULLBACK",
      selectedStrategyId: "TREND_PULLBACK",
      mode: "REGIME_MATCH",
      reasonCode: "TREND_REGIME",
      reason: "TREND_UP is a directional trend regime; prefer pullback continuation.",
    };

    render(<SignalExecutiveSummary result={direct} />);

    expect(screen.getByLabelText("Strategy routing")).toHaveTextContent(
      "REGIME_MATCH"
    );
    expect(screen.queryByText(/not implemented yet/i)).not.toBeInTheDocument();
  });
});
