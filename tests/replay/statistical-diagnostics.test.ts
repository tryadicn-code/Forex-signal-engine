import { describe, expect, it } from "vitest";
import {
  buildValidationSummary,
  calculateBacktestStatisticalDiagnostics,
  wilsonProportionInterval,
} from "@/replay/statistical-diagnostics";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import type { HistoricalTrade } from "@/replay/execution-types";

const DAY = 24 * 60 * 60_000;
const START = Date.UTC(2026, 0, 1);
const END = START + 100 * DAY;

function trade(
  id: string,
  openedDay: number,
  pnl: number,
  r: number
): HistoricalTrade {
  return {
    id,
    orderId: "order-" + id,
    positionId: "position-" + id,
    signalId: "signal-" + id,
    symbol: "EURUSD",
    side: r >= 0 ? "LONG" : "SHORT",
    entryPrice: 1.1,
    exitPrice: r >= 0 ? 1.11 : 1.095,
    stopLoss: r >= 0 ? 1.095 : 1.105,
    takeProfit: r >= 0 ? 1.11 : 1.09,
    positionSize: 1,
    riskAmount: 50,
    riskPercent: 0.5,
    plannedRR: 2,
    realizedPnL: pnl,
    realizedPnLPercent: pnl / 100,
    realizedR: r,
    openedAt: START + openedDay * DAY,
    closedAt: START + (openedDay + 1) * DAY,
    holdingDurationMs: DAY,
    closeReason: pnl >= 0 ? "TAKE_PROFIT" : "STOP_LOSS",
    engine: {
      bias: r >= 0 ? "STRONG_LONG" : "STRONG_SHORT",
      setupScore: 85,
      executionDecision: "EXECUTE",
      freshness: "FRESH",
    },
  };
}

function artifact(): BacktestRunArtifact {
  const trades = [
    trade("t1", 5, 100, 2),
    trade("t2", 15, -50, -1),
    trade("t3", 25, 50, 1),
    trade("t4", 35, -50, -1),
    trade("t5", 45, 100, 2),
    trade("t6", 55, -50, -1),
    trade("t7", 72, 100, 2),
    trade("t8", 80, -50, -1),
    trade("t9", 88, 50, 1),
    trade("t10", 95, 100, 2),
  ];

  return {
    schemaVersion: 1,
    id: "backtest-statistics-test",
    createdAt: 1,
    completedAt: 2,
    durationMs: 1,
    config: {
      datasetId: "statistics-test",
      source: "synthetic",
      sourceUtcOffsetMinutes: 0,
      assumedSpreadPips: 1,
      startAt: START,
      endAt: END,
      initialBalance: 10_000,
      riskPercent: 0.5,
      intrabarConflictPolicy: "STOP_FIRST",
      maxOpenPositions: 10,
      maxTotalOpenRiskPercent: 5,
      maxReplaySteps: 50_000,
    },
    validation: {
      valid: true,
      datasetId: "statistics-test",
      source: "synthetic",
      sourceUtcOffsetMinutes: 0,
      assumedSpreadPips: 1,
      importedFileCount: 4,
      importedSymbolCount: 1,
      importedSeriesCount: 4,
      files: [],
      series: [],
      symbols: ["EURUSD"],
      commonStartAt: START,
      commonEndAt: END,
      estimatedM15Steps: 100,
      issues: [],
    },
    execution: {
      enabled: true,
      executionTimeframe: "M15",
      intrabarConflictPolicy: "STOP_FIRST",
      initialBalance: 10_000,
      balance: 10_300,
      equity: 10_300,
      realizedPnL: 300,
      unrealizedPnL: 0,
      openRiskAmount: 0,
      openRiskPercent: 0,
      orderCount: trades.length,
      openPositionCount: 0,
      closedTradeCount: trades.length,
      orders: [],
      openPositions: [],
      trades,
      equityCurve: [],
    },
    analytics: {
      sampleSize: trades.length,
      wins: 6,
      losses: 4,
      breakEven: 0,
      winRate: 60,
      lossRate: 40,
      initialBalance: 10_000,
      finalBalance: 10_300,
      netPnL: 300,
      netReturnPercent: 3,
      grossProfit: 500,
      grossLoss: -200,
      averageWin: 500 / 6,
      averageLoss: 50,
      payoffRatio: (500 / 6) / 50,
      profitFactor: 2.5,
      expectancyAmount: 30,
      netR: 6,
      averageR: 0.6,
      medianR: 1,
      standardDeviationR: 1.3,
      expectancyR: 0.6,
      bestTradePnL: 100,
      worstTradePnL: -50,
      bestTradeR: 2,
      worstTradeR: -1,
      averageHoldingTimeMs: DAY,
      medianHoldingTimeMs: DAY,
      consecutiveWins: 1,
      consecutiveLosses: 1,
      maxEquityDrawdownAmount: 50,
      maxEquityDrawdownPercent: 0.5,
      maxEquityDrawdownAt: START + 16 * DAY,
      currentEquityDrawdownAmount: 0,
      currentEquityDrawdownPercent: 0,
      maxBalanceDrawdownAmount: 50,
      maxBalanceDrawdownPercent: 0.5,
      maxBalanceDrawdownAt: START + 16 * DAY,
      equityCurve: [],
      rDistribution: [],
      segments: {
        byStrategy: [],
        bySymbol: [],
        byDirection: [],
        byBias: [],
        bySetupScore: [],
        byEntrySession: [],
        byCloseReason: [],
      },
    },
  };
}

describe("Phase 5.7 statistical diagnostics", () => {
  it("calculates a bounded 95% Wilson interval for win rate", () => {
    const interval = wilsonProportionInterval(6, 10);

    expect(interval.estimate).toBe(60);
    expect(interval.lower).toBeGreaterThan(0);
    expect(interval.upper).toBeLessThan(100);
    expect(interval.lower).toBeLessThan(interval.estimate);
    expect(interval.upper).toBeGreaterThan(interval.estimate);
  });

  it("produces deterministic bootstrap and trade-order Monte Carlo diagnostics", () => {
    const first = calculateBacktestStatisticalDiagnostics(artifact(), {
      bootstrapIterations: 500,
      monteCarloIterations: 500,
    });
    const second = calculateBacktestStatisticalDiagnostics(artifact(), {
      bootstrapIterations: 500,
      monteCarloIterations: 500,
    });

    expect(first).toEqual(second);
    expect(first.expectancyRBootstrap95?.interval.estimate).toBeCloseTo(0.6);
    expect(
      first.expectancyRBootstrap95?.positiveResampleFraction
    ).toBeGreaterThan(0);
    expect(first.tradeOrderMonteCarlo?.p95MaxDrawdownR).toBeGreaterThanOrEqual(
      first.tradeOrderMonteCarlo?.medianMaxDrawdownR ?? 0
    );
    expect(first.tradeOrderMonteCarlo?.worstMaxDrawdownR).toBeGreaterThanOrEqual(
      first.tradeOrderMonteCarlo?.p99MaxDrawdownR ?? 0
    );
  });

  it("keeps terminal Net R unchanged conceptually while measuring order-sensitive drawdown", () => {
    const diagnostics = calculateBacktestStatisticalDiagnostics(artifact(), {
      bootstrapIterations: 200,
      monteCarloIterations: 500,
    });

    expect(artifact().analytics.netR).toBe(6);
    expect(diagnostics.tradeOrderMonteCarlo?.observedMaxDrawdownR).toBeGreaterThanOrEqual(0);
    expect(diagnostics.tradeOrderMonteCarlo?.p95MaxDrawdownR).toBeGreaterThanOrEqual(0);
  });

  it("surfaces minimum-sample warnings instead of suppressing small samples", () => {
    const diagnostics = calculateBacktestStatisticalDiagnostics(artifact(), {
      bootstrapIterations: 100,
      monteCarloIterations: 100,
    });

    expect(
      diagnostics.sampleWarnings.some(
        (warning) => warning.code === "FULL_SAMPLE_VERY_SMALL"
      )
    ).toBe(true);
    expect(
      diagnostics.sampleWarnings.some(
        (warning) => warning.code === "OOS_SAMPLE_SMALL"
      )
    ).toBe(true);
  });

  it("builds a compact reproducible validation summary", () => {
    const summary = buildValidationSummary(artifact());

    expect(summary.protocol).toBe("phase-5.7-v1");
    expect(summary.report.id).toBe("backtest-statistics-test");
    expect(summary.corePerformance.sampleSize).toBe(10);
    expect(summary.reproducibility.combined).toMatch(/^[a-f0-9]{16}$/);
    expect(summary.holdout70_30.outOfSampleSampleSize).toBe(4);
    expect(summary.sequential4Fold.foldCount).toBe(4);
    expect(summary.interpretationNotes.length).toBeGreaterThan(0);
  });

  it("handles zero trades without NaN/Infinity", () => {
    const empty = artifact();
    empty.execution.trades = [];
    empty.execution.closedTradeCount = 0;
    empty.analytics.sampleSize = 0;
    empty.analytics.winRate = null;
    empty.analytics.expectancyR = null;
    empty.analytics.averageR = null;
    empty.analytics.netR = 0;

    const diagnostics = calculateBacktestStatisticalDiagnostics(empty, {
      bootstrapIterations: 100,
      monteCarloIterations: 100,
    });

    expect(diagnostics.winRateWilson95).toBeNull();
    expect(diagnostics.expectancyRBootstrap95).toBeNull();
    expect(diagnostics.tradeOrderMonteCarlo).toBeNull();
    expect(JSON.stringify(diagnostics)).not.toContain("NaN");
    expect(JSON.stringify(diagnostics)).not.toContain("Infinity");
  });
});
