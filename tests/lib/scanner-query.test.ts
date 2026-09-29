import { describe, expect, it } from "vitest";
import { applyScannerQuery, DEFAULT_QUERY } from "@/lib/scanner-query";
import { failureResult, type SymbolScanResult } from "@/scanner/scanner-result";

const T0 = Date.UTC(2026, 8, 30, 2, 40, 0);

function analysed(
  symbol: string,
  overrides: Partial<SymbolScanResult> = {}
): SymbolScanResult {
  return {
    ...failureResult(symbol, "ANALYSED", "Analysed successfully.", T0),
    status: "ANALYSED",
    latestPrice: 1.1,
    spreadPips: 1,
    regime: "TREND_UP",
    bias: "LONG",
    biasScore: 70,
    biasDirection: "LONG",
    setupState: "ARMED",
    setupScore: 80,
    triggerState: "CONFIRMED",
    triggerScore: 100,
    triggerAgeInBars: 0,
    riskReward: 2,
    positionSize: 0.5,
    executionDecision: "EXECUTE",
    signalState: "EXECUTE",
    signalId: "sig-" + symbol,
    freshness: "FRESH",
    updatedAt: T0,
    timeframes: [],
    executionDetail: null,
    riskDetail: null,
    evidence: [],
    conflicts: [],
    issues: [],
    errors: [],
    ...overrides,
  };
}

describe("scanner EXECUTE filter", () => {
  it("shows only actionable execute signals", () => {
    const actionable = analysed("EURUSD");
    const closed = analysed("EURAUD", { signalState: "CLOSED" });
    const waiting = analysed("GBPUSD", {
      executionDecision: "WAIT",
      signalState: "ARMED",
    });

    const filtered = applyScannerQuery(
      [actionable, closed, waiting],
      { ...DEFAULT_QUERY, state: "EXECUTE" }
    );

    expect(filtered.map((result) => result.symbol)).toEqual(["EURUSD"]);
  });

  it("does not treat lifecycle-only EXECUTE as actionable when engine is not EXECUTE", () => {
    const inconsistent = analysed("USDJPY", {
      executionDecision: "WAIT",
      signalState: "EXECUTE",
    });

    const filtered = applyScannerQuery(
      [inconsistent],
      { ...DEFAULT_QUERY, state: "EXECUTE" }
    );

    expect(filtered).toHaveLength(0);
  });
});
