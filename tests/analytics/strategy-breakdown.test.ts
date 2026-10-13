import { describe, expect, it } from "vitest";
import {
  computeStrategyBreakdown,
  KNOWN_STRATEGY_IDS,
  type StrategyBreakdownTrade,
} from "@/analytics/strategy-breakdown";
import type { SignalFunnelObservation } from "@/analytics/signal-funnel";

function obs(overrides: Partial<SignalFunnelObservation>): SignalFunnelObservation {
  return {
    symbol: "EURUSD",
    observedAt: 1,
    strategyId: "TREND_PULLBACK",
    regime: "TREND_DOWN",
    biasDirection: "SHORT",
    setupState: "SETUP",
    triggerState: "WAITING",
    executionDecision: "BLOCKED",
    passedStages: ["SCANNED", "DATA_VALID"],
    deepestStage: "DATA_VALID",
    rejectionStage: null,
    rejectionCode: null,
    rejectionDetail: null,
    ...overrides,
  } as SignalFunnelObservation;
}

function trade(
  strategyId: string | null,
  realizedPnL: number,
  realizedR: number
): StrategyBreakdownTrade {
  return {
    engine: { strategyId },
    realizedPnL,
    realizedR,
  };
}

describe("computeStrategyBreakdown", () => {
  it("surfaces all known strategies even with zero activity", () => {
    const rows = computeStrategyBreakdown([], []);
    expect(rows).toHaveLength(KNOWN_STRATEGY_IDS.length);
    for (const row of rows) {
      expect(row.signalObservations).toBe(0);
      expect(row.closedTrades).toBe(0);
      expect(row.winRate).toBeNull();
      expect(row.avgR).toBeNull();
    }
  });

  it("counts observations per strategy and per deepest stage", () => {
    const rows = computeStrategyBreakdown(
      [
        obs({ strategyId: "TREND_PULLBACK", passedStages: ["SCANNED"] }),
        obs({
          strategyId: "TREND_PULLBACK",
          passedStages: ["SCANNED", "DATA_VALID", "BIAS_DIRECTIONAL", "SETUP_ACTIONABLE", "TRIGGER_CONFIRMED"],
        }),
        obs({ strategyId: "BREAKOUT_RETEST", passedStages: ["SCANNED"] }),
        obs({ strategyId: null, passedStages: ["SCANNED"] }),
      ],
      []
    );

    const tp = rows.find((r) => r.strategyId === "TREND_PULLBACK")!;
    expect(tp.signalObservations).toBe(2);
    expect(tp.reachedTrigger).toBe(1);
    expect(tp.reachedRisk).toBe(0);
    expect(tp.reachedExecute).toBe(0);

    const br = rows.find((r) => r.strategyId === "BREAKOUT_RETEST")!;
    expect(br.signalObservations).toBe(1);
    expect(br.reachedTrigger).toBe(0);

    // null strategyId observations are ignored
    const total = rows.reduce((sum, r) => sum + r.signalObservations, 0);
    expect(total).toBe(3);
  });

  it("attributes closed trades to strategy and computes win rate", () => {
    const rows = computeStrategyBreakdown(
      [],
      [
        trade("TREND_PULLBACK", 100, 2),
        trade("TREND_PULLBACK", -50, -1),
        trade("TREND_PULLBACK", 75, 1.5),
        trade("BREAKOUT_RETEST", -50, -1),
        trade("BREAKOUT_RETEST", -50, -1),
        trade(null, 100, 2),
        trade("UNKNOWN_STRATEGY", 50, 1),
      ]
    );

    const tp = rows.find((r) => r.strategyId === "TREND_PULLBACK")!;
    expect(tp.closedTrades).toBe(3);
    expect(tp.wins).toBe(2);
    expect(tp.losses).toBe(1);
    expect(tp.winRate).toBeCloseTo((2 / 3) * 100, 5);
    expect(tp.netPnL).toBeCloseTo(125);
    expect(tp.netR).toBeCloseTo(2.5);
    expect(tp.avgR).toBeCloseTo(2.5 / 3, 5);

    const br = rows.find((r) => r.strategyId === "BREAKOUT_RETEST")!;
    expect(br.closedTrades).toBe(2);
    expect(br.wins).toBe(0);
    expect(br.losses).toBe(2);
    expect(br.winRate).toBe(0);
    expect(br.netPnL).toBeCloseTo(-100);
    expect(br.netR).toBeCloseTo(-2);

    // Unknown strategy surfaces after known ones
    const unknown = rows.find((r) => r.strategyId === "UNKNOWN_STRATEGY");
    expect(unknown).toBeDefined();
    expect(unknown!.closedTrades).toBe(1);
  });

  it("treats break-even trades separately from wins and losses", () => {
    const rows = computeStrategyBreakdown(
      [],
      [trade("TREND_PULLBACK", 0, 0), trade("TREND_PULLBACK", 100, 2)]
    );
    const tp = rows.find((r) => r.strategyId === "TREND_PULLBACK")!;
    expect(tp.closedTrades).toBe(2);
    expect(tp.wins).toBe(1);
    expect(tp.losses).toBe(0);
    expect(tp.breakEven).toBe(1);
    expect(tp.winRate).toBeCloseTo(50, 5);
  });

  it("sorts known strategies by canonical order, not by count", () => {
    const rows = computeStrategyBreakdown(
      [
        obs({ strategyId: "BREAKOUT_RETEST" }),
        obs({ strategyId: "BREAKOUT_RETEST" }),
        obs({ strategyId: "BREAKOUT_RETEST" }),
        obs({ strategyId: "TREND_PULLBACK" }),
      ],
      []
    );
    const ids = rows.map((r) => r.strategyId);
    // TREND_PULLBACK listed first even though it has fewer observations
    expect(ids[0]).toBe("TREND_PULLBACK");
    expect(ids[1]).toBe("BREAKOUT_RETEST");
    expect(ids[2]).toBe("RANGE_MEAN_REVERSION");
    expect(ids[3]).toBe("REVERSAL");
  });

  it("handles empty input without throwing", () => {
    const rows = computeStrategyBreakdown([], []);
    expect(rows.length).toBeGreaterThan(0);
  });
});