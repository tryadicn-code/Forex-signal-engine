import { describe, it, expect } from "vitest";
import {
  observedTStatistic,
  requiredTStatistic,
  evaluateMultipleTesting,
} from "@/replay/multiple-testing";
import type { HistoricalTrade } from "@/replay/execution-types";

function fakeTrade(r: number): HistoricalTrade {
  return {
    id: "t-" + Math.random(),
    orderId: "o", positionId: "p", signalId: "s",
    symbol: "EURUSD", side: "LONG",
    entryPrice: 1.1, exitPrice: 1.1 + r * 0.001,
    stopLoss: 1.099, takeProfit: 1.101,
    positionSize: 1, riskAmount: 50, riskPercent: 0.5,
    plannedRR: 2, realizedPnL: r * 50, realizedPnLPercent: r * 0.5,
    realizedR: r, openedAt: 0, closedAt: 1,
    holdingDurationMs: 1, closeReason: "TAKE_PROFIT",
    engine: { bias: "STRONG_LONG", setupScore: 80, executionDecision: "EXECUTE", freshness: "FRESH" },
  };
}

describe("B3-M4 multiple-testing", () => {
  it("observed t-stat is null for degenerate samples", () => {
    expect(observedTStatistic([])).toBeNull();
    expect(observedTStatistic([0.5])).toBeNull();
    expect(observedTStatistic([0.5, 0.5, 0.5])).toBeNull(); // zero variance
  });

  it("observed t-stat is positive for a profitable series", () => {
    const r = [0.1, 0.2, 0.15, 0.05, 0.3, -0.1, 0.25, 0.12, 0.08, 0.18];
    const t = observedTStatistic(r);
    expect(t).not.toBeNull();
    expect(t! > 0).toBe(true);
  });

  it("required t-stat grows with the number of trials", () => {
    const one = requiredTStatistic(1, 0.05);
    const ten = requiredTStatistic(10, 0.05);
    const hundred = requiredTStatistic(100, 0.05);
    expect(one).toBeCloseTo(1.96, 1);
    expect(ten).toBeGreaterThan(one);
    expect(hundred).toBeGreaterThan(ten);
  });

  it("required t-stat at M=1 matches standard 95% z", () => {
    expect(requiredTStatistic(1, 0.05)).toBeCloseTo(1.96, 1);
  });

  it("evaluateMultipleTesting is disabled when trials = 1", () => {
    const trades = [fakeTrade(0.2), fakeTrade(-0.1), fakeTrade(0.3)];
    const result = evaluateMultipleTesting({
      trades,
      numberOfDevelopmentTrials: 1,
      alpha: 0.05,
    });
    expect(result.enabled).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("evaluateMultipleTesting blocks a weak effect after many trials", () => {
    // Realistic weak edge: mean R ~0.1 with substantial variance, so t-stat
    // is roughly 1.5 — passes an uncorrected 95% test but fails Bonferroni
    // after 100 trials (required t ~= 3.48).
    const pattern = [0.5, -1.0, 0.5, -0.5, 0.7, -1.0, 0.5, -0.3, 0.8, -0.7];
    const trades = Array.from({ length: 100 }, (_, i) =>
      fakeTrade(pattern[i % pattern.length])
    );
    const result = evaluateMultipleTesting({
      trades,
      numberOfDevelopmentTrials: 100,
      alpha: 0.05,
    });
    expect(result.enabled).toBe(true);
    expect(result.observedTStatistic).not.toBeNull();
    expect(result.observedTStatistic!).toBeLessThan(3.0);
    expect(result.passed).toBe(false);
  });

  it("evaluateMultipleTesting passes a strong effect even after many trials", () => {
    // Strong edge: mean R ~1.2 with modest variance, so t-stat is well above
    // the Bonferroni bar for any trial count up to a few thousand.
    const pattern = [2.0, -1.0, 2.0, -1.0, 2.0, -1.0, 2.0, -1.0, 1.5, -0.5];
    const trades = Array.from({ length: 100 }, (_, i) =>
      fakeTrade(pattern[i % pattern.length])
    );
    const result = evaluateMultipleTesting({
      trades,
      numberOfDevelopmentTrials: 100,
      alpha: 0.05,
    });
    expect(result.enabled).toBe(true);
    expect(result.passed).toBe(true);
  });
});