import { describe, expect, it } from "vitest";
import {
  calculateHistoricalAnalytics,
  compareHistoricalToForward,
  toComparableHistoricalPerformance,
} from "@/replay/backtest-analytics";
import type {
  HistoricalExecutionSummary,
  HistoricalTrade,
} from "@/replay/execution-types";

const DAY = 24 * 60 * 60_000;
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

function trade(input: {
  id: string;
  pnl: number;
  r: number;
  closedAt: number;
  symbol?: string;
  side?: "LONG" | "SHORT";
  setupScore?: number | null;
  openedAt?: number;
  closeReason?: "TAKE_PROFIT" | "STOP_LOSS" | "AMBIGUOUS_BAR";
}): HistoricalTrade {
  const openedAt = input.openedAt ?? input.closedAt - 60 * 60_000;
  return {
    id: input.id,
    orderId: "order-" + input.id,
    positionId: "position-" + input.id,
    signalId: "signal-" + input.id,
    symbol: input.symbol ?? "EURUSD",
    side: input.side ?? "LONG",
    entryPrice: 1.1,
    exitPrice: 1.1,
    stopLoss: 1.095,
    takeProfit: 1.11,
    positionSize: 1,
    riskAmount: 50,
    riskPercent: 0.5,
    plannedRR: 2,
    realizedPnL: input.pnl,
    realizedPnLPercent: input.pnl / 100,
    realizedR: input.r,
    openedAt,
    closedAt: input.closedAt,
    holdingDurationMs: input.closedAt - openedAt,
    closeReason:
      input.closeReason ??
      (input.pnl > 0 ? "TAKE_PROFIT" : "STOP_LOSS"),
    engine: {
      bias: input.side === "SHORT" ? "STRONG_SHORT" : "STRONG_LONG",
      setupScore: input.setupScore ?? 85,
      executionDecision: "EXECUTE",
      freshness: "FRESH",
    },
  };
}

function executionSummary(): HistoricalExecutionSummary {
  const trades = [
    trade({
      id: "t1",
      pnl: 100,
      r: 2,
      closedAt: T0 + DAY,
      openedAt: T0 + 6 * 60 * 60_000,
      symbol: "EURUSD",
      side: "LONG",
      setupScore: 85,
    }),
    trade({
      id: "t2",
      pnl: -50,
      r: -1,
      closedAt: T0 + 2 * DAY,
      openedAt: T0 + DAY + 14 * 60 * 60_000,
      symbol: "EURUSD",
      side: "LONG",
      setupScore: 75,
      closeReason: "STOP_LOSS",
    }),
    trade({
      id: "t3",
      pnl: 50,
      r: 1,
      closedAt: T0 + 3 * DAY,
      openedAt: T0 + 2 * DAY + 18 * 60 * 60_000,
      symbol: "GBPUSD",
      side: "SHORT",
      setupScore: 92,
    }),
  ];

  return {
    enabled: true,
    executionTimeframe: "M15",
    intrabarConflictPolicy: "STOP_FIRST",
    initialBalance: 10_000,
    balance: 10_100,
    equity: 10_100,
    realizedPnL: 100,
    unrealizedPnL: 0,
    openRiskAmount: 0,
    openRiskPercent: 0,
    orderCount: 3,
    openPositionCount: 0,
    closedTradeCount: 3,
    orders: [],
    openPositions: [],
    trades,
    equityCurve: [
      {
        asOf: T0,
        balance: 10_000,
        equity: 10_000,
        realizedPnL: 0,
        unrealizedPnL: 0,
        openPositionCount: 0,
        openRiskPercent: 0,
      },
      {
        asOf: T0 + DAY,
        balance: 10_100,
        equity: 10_100,
        realizedPnL: 100,
        unrealizedPnL: 0,
        openPositionCount: 0,
        openRiskPercent: 0,
      },
      {
        // Floating loss is intentionally deeper than realized balance DD.
        asOf: T0 + DAY + 12 * 60 * 60_000,
        balance: 10_100,
        equity: 9_900,
        realizedPnL: 100,
        unrealizedPnL: -200,
        openPositionCount: 1,
        openRiskPercent: 0.5,
      },
      {
        asOf: T0 + 2 * DAY,
        balance: 10_050,
        equity: 10_050,
        realizedPnL: 50,
        unrealizedPnL: 0,
        openPositionCount: 0,
        openRiskPercent: 0,
      },
      {
        asOf: T0 + 3 * DAY,
        balance: 10_100,
        equity: 10_100,
        realizedPnL: 100,
        unrealizedPnL: 0,
        openPositionCount: 0,
        openRiskPercent: 0,
      },
    ],
  };
}

describe("calculateHistoricalAnalytics", () => {
  it("computes core backtest performance metrics from closed historical trades", () => {
    const analytics = calculateHistoricalAnalytics(executionSummary());

    expect(analytics.sampleSize).toBe(3);
    expect(analytics.wins).toBe(2);
    expect(analytics.losses).toBe(1);
    expect(analytics.winRate).toBeCloseTo(66.6667, 3);
    expect(analytics.grossProfit).toBe(150);
    expect(analytics.grossLoss).toBe(-50);
    expect(analytics.netPnL).toBe(100);
    expect(analytics.netReturnPercent).toBeCloseTo(1);
    expect(analytics.profitFactor).toBeCloseTo(3);
    expect(analytics.payoffRatio).toBeCloseTo(1.5);
    expect(analytics.expectancyAmount).toBeCloseTo(33.3333, 3);
    expect(analytics.netR).toBe(2);
    expect(analytics.averageR).toBeCloseTo(2 / 3);
    expect(analytics.medianR).toBe(1);
    expect(analytics.expectancyR).toBeCloseTo(2 / 3);
    expect(analytics.bestTradeR).toBe(2);
    expect(analytics.worstTradeR).toBe(-1);
  });

  it("uses mark-to-market equity for drawdown, not only closed balance", () => {
    const analytics = calculateHistoricalAnalytics(executionSummary());

    expect(analytics.maxEquityDrawdownAmount).toBe(200);
    expect(analytics.maxEquityDrawdownPercent).toBeCloseTo(
      (200 / 10_100) * 100
    );
    expect(analytics.maxEquityDrawdownAt).toBe(
      T0 + DAY + 12 * 60 * 60_000
    );

    expect(analytics.maxBalanceDrawdownAmount).toBe(50);
    expect(analytics.maxBalanceDrawdownPercent).toBeCloseTo(
      (50 / 10_100) * 100
    );
  });

  it("builds mutually exclusive R distribution bins", () => {
    const analytics = calculateHistoricalAnalytics(executionSummary());
    const counts = Object.fromEntries(
      analytics.rDistribution.map((bin) => [bin.key, bin.count])
    );

    expect(counts.LTE_NEG_1).toBe(1);
    expect(counts.NEG_1_TO_0).toBe(0);
    expect(counts.ZERO_TO_1).toBe(0);
    expect(counts.ONE_TO_2).toBe(1);
    expect(counts.GTE_2).toBe(1);
    expect(
      analytics.rDistribution.reduce((sum, bin) => sum + bin.count, 0)
    ).toBe(analytics.sampleSize);
  });

  it("segments results by symbol, direction, setup score, session, bias and exit reason", () => {
    const analytics = calculateHistoricalAnalytics(executionSummary());

    expect(analytics.segments.bySymbol.find((row) => row.key === "EURUSD")?.sampleSize).toBe(2);
    expect(analytics.segments.bySymbol.find((row) => row.key === "GBPUSD")?.sampleSize).toBe(1);
    expect(analytics.segments.byDirection.find((row) => row.key === "LONG")?.sampleSize).toBe(2);
    expect(analytics.segments.byDirection.find((row) => row.key === "SHORT")?.sampleSize).toBe(1);
    expect(analytics.segments.bySetupScore.find((row) => row.key === "70_79")?.sampleSize).toBe(1);
    expect(analytics.segments.bySetupScore.find((row) => row.key === "80_89")?.sampleSize).toBe(1);
    expect(analytics.segments.bySetupScore.find((row) => row.key === "GTE_90")?.sampleSize).toBe(1);
    expect(analytics.segments.byEntrySession.find((row) => row.key === "ASIA")?.sampleSize).toBe(1);
    expect(analytics.segments.byEntrySession.find((row) => row.key === "OVERLAP")?.sampleSize).toBe(1);
    expect(analytics.segments.byEntrySession.find((row) => row.key === "NEW_YORK")?.sampleSize).toBe(1);
    expect(analytics.segments.byCloseReason.find((row) => row.key === "STOP_LOSS")?.sampleSize).toBe(1);
  });

  it("handles zero trades without NaN or Infinity", () => {
    const empty: HistoricalExecutionSummary = {
      enabled: true,
      executionTimeframe: "M15",
      intrabarConflictPolicy: "STOP_FIRST",
      initialBalance: 10_000,
      balance: 10_000,
      equity: 10_000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      openRiskAmount: 0,
      openRiskPercent: 0,
      orderCount: 0,
      openPositionCount: 0,
      closedTradeCount: 0,
      orders: [],
      openPositions: [],
      trades: [],
      equityCurve: [],
    };

    const analytics = calculateHistoricalAnalytics(empty);

    expect(analytics.sampleSize).toBe(0);
    expect(analytics.winRate).toBeNull();
    expect(analytics.profitFactor).toBeNull();
    expect(analytics.expectancyAmount).toBeNull();
    expect(analytics.expectancyR).toBeNull();
    expect(analytics.maxEquityDrawdownPercent).toBe(0);
    expect(JSON.stringify(analytics)).not.toContain("NaN");
    expect(JSON.stringify(analytics)).not.toContain("Infinity");
  });

  it("uses explicit null instead of Infinity when there are wins but no losses", () => {
    const summary = executionSummary();
    summary.trades = summary.trades.filter((item) => item.realizedPnL > 0);
    summary.closedTradeCount = summary.trades.length;
    summary.balance = 10_150;
    summary.realizedPnL = 150;

    const analytics = calculateHistoricalAnalytics(summary);

    expect(analytics.profitFactor).toBeNull();
  });
});

describe("historical vs forward comparison", () => {
  it("compares normalized metrics without reading Phase 4 storage", () => {
    const historicalAnalytics = calculateHistoricalAnalytics(executionSummary());
    const historical = toComparableHistoricalPerformance(historicalAnalytics);
    const forward = {
      sampleSize: 10,
      winRate: 60,
      profitFactor: 2.5,
      expectancyR: 0.5,
      averageR: 0.5,
      maxDrawdownPercent: 3,
      netReturnPercent: 4,
    };

    const comparison = compareHistoricalToForward(historical, forward);

    expect(comparison.historical.sampleSize).toBe(3);
    expect(comparison.forward.sampleSize).toBe(10);
    expect(comparison.delta.sampleSize).toBe(7);
    expect(comparison.delta.netReturnPercent).toBeCloseTo(3);
    expect(comparison.delta.maxDrawdownPercent).toBeCloseTo(
      3 - historical.maxDrawdownPercent
    );
  });
});
