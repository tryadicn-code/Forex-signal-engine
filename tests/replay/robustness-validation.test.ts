import { describe, expect, it } from "vitest";
import {
  buildBacktestReproducibilityFingerprint,
  calculateSequentialValidation,
  calculateTemporalHoldout,
} from "@/replay/robustness-validation";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import type { HistoricalTrade } from "@/replay/execution-types";

const DAY = 24 * 60 * 60_000;
const START = Date.UTC(2026, 0, 1);
const END = START + 100 * DAY;

function trade(
  id: string,
  openedDay: number,
  closedDay: number,
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
    closedAt: START + closedDay * DAY,
    holdingDurationMs: (closedDay - openedDay) * DAY,
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
    trade("t1", 10, 11, 100, 2),
    trade("t2", 25, 26, -50, -1),
    trade("crossing", 65, 75, 50, 1),
    trade("t4", 72, 73, 100, 2),
    trade("t5", 82, 83, -50, -1),
    trade("t6", 94, 95, 50, 1),
  ];

  return {
    schemaVersion: 1,
    id: "backtest-robustness-test",
    createdAt: 1,
    completedAt: 2,
    durationMs: 1,
    config: {
      datasetId: "robustness-test",
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
      datasetId: "robustness-test",
      source: "synthetic",
      sourceUtcOffsetMinutes: 0,
      assumedSpreadPips: 1,
      importedFileCount: 4,
      importedSymbolCount: 1,
      importedSeriesCount: 4,
      files: [
        {
          fileName: "EURUSD_M15.csv",
          symbol: "EURUSD",
          timeframe: "M15",
          delimiter: "comma",
          rowCount: 100,
          importedRows: 100,
          duplicateRows: 0,
          startAt: START,
          endAt: END,
        },
      ],
      series: [
        {
          symbol: "EURUSD",
          timeframe: "M15",
          candleCount: 100,
          startAt: START,
          endAt: END,
          nonWeekendGapCount: 0,
          largestGapMs: 15 * 60_000,
        },
      ],
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
      balance: 10_200,
      equity: 10_200,
      realizedPnL: 200,
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
      wins: 4,
      losses: 2,
      breakEven: 0,
      winRate: (4 / 6) * 100,
      lossRate: (2 / 6) * 100,
      initialBalance: 10_000,
      finalBalance: 10_200,
      netPnL: 200,
      netReturnPercent: 2,
      grossProfit: 300,
      grossLoss: -100,
      averageWin: 75,
      averageLoss: 50,
      payoffRatio: 1.5,
      profitFactor: 3,
      expectancyAmount: 200 / 6,
      netR: 4,
      averageR: 4 / 6,
      medianR: 1,
      standardDeviationR: 1,
      expectancyR: 4 / 6,
      bestTradePnL: 100,
      worstTradePnL: -50,
      bestTradeR: 2,
      worstTradeR: -1,
      averageHoldingTimeMs: DAY,
      medianHoldingTimeMs: DAY,
      consecutiveWins: 2,
      consecutiveLosses: 1,
      maxEquityDrawdownAmount: 50,
      maxEquityDrawdownPercent: 0.5,
      maxEquityDrawdownAt: START + 26 * DAY,
      currentEquityDrawdownAmount: 0,
      currentEquityDrawdownPercent: 0,
      maxBalanceDrawdownAmount: 50,
      maxBalanceDrawdownPercent: 0.5,
      maxBalanceDrawdownAt: START + 26 * DAY,
      equityCurve: [],
      rDistribution: [],
      segments: {
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

describe("Phase 5.6 temporal holdout", () => {
  it("assigns trades by entry time so pre-boundary positions cannot leak into OOS", () => {
    const result = calculateTemporalHoldout(artifact(), 0.7);

    expect(result.splitAt).toBe(START + 70 * DAY);
    expect(result.inSample.metrics.sampleSize).toBe(3);
    expect(result.outOfSample.metrics.sampleSize).toBe(3);

    // The crossing trade opened on day 65 and closed on day 75. It belongs
    // to in-sample because the entry decision existed before the OOS boundary.
    expect(result.inSample.metrics.netR).toBe(2);
    expect(result.outOfSample.metrics.netR).toBe(2);
  });

  it("fails closed for extreme holdout ratios", () => {
    expect(() => calculateTemporalHoldout(artifact(), 0.95)).toThrow(
      /between 0.5 and 0.9/
    );
  });
});

describe("Phase 5.6 sequential validation", () => {
  it("uses expanding development windows and non-overlapping validation windows", () => {
    const result = calculateSequentialValidation(artifact(), 4);

    expect(result.folds).toHaveLength(4);
    expect(result.folds[0].developmentStartAt).toBe(START);
    expect(result.folds[0].developmentEndAt).toBe(START + 20 * DAY);
    expect(result.folds[0].validationStartAt).toBe(START + 20 * DAY);
    expect(result.folds[0].validationEndAt).toBe(START + 40 * DAY);

    expect(result.folds[1].developmentStartAt).toBe(START);
    expect(result.folds[1].developmentEndAt).toBe(START + 40 * DAY);
    expect(result.folds[1].validationStartAt).toBe(START + 40 * DAY);
    expect(result.folds[1].validationEndAt).toBe(START + 60 * DAY);

    expect(result.diagnostics.foldCount).toBe(4);
    expect(result.diagnostics.validationTradeCount).toBe(5);
    expect(result.diagnostics.emptyFolds).toBe(1);
  });

  it("rejects unsupported fold counts", () => {
    expect(() => calculateSequentialValidation(artifact(), 1)).toThrow(
      /integer from 2 to 8/
    );
    expect(() => calculateSequentialValidation(artifact(), 9)).toThrow(
      /integer from 2 to 8/
    );
  });
});

describe("Phase 5.6 reproducibility fingerprint", () => {
  it("is deterministic and ignores organizational metadata", () => {
    const base = artifact();
    const first = buildBacktestReproducibilityFingerprint(base);
    const second = buildBacktestReproducibilityFingerprint({
      ...base,
      metadata: {
        label: "Changed label",
        tags: ["reviewed"],
        updatedAt: Date.now(),
      },
    });

    expect(first).toEqual(second);
    expect(first.combined).toMatch(/^[a-f0-9]{16}$/);
  });

  it("changes the assumptions fingerprint when a run assumption changes", () => {
    const base = artifact();
    const changed = artifact();
    changed.config.assumedSpreadPips = 1.5;

    const first = buildBacktestReproducibilityFingerprint(base);
    const second = buildBacktestReproducibilityFingerprint(changed);

    expect(second.assumptions).not.toBe(first.assumptions);
    expect(second.combined).not.toBe(first.combined);
    expect(second.outcomes).toBe(first.outcomes);
  });

  it("changes the outcome fingerprint when a historical trade changes", () => {
    const base = artifact();
    const changed = artifact();
    changed.execution.trades[0].realizedR = 1.5;

    const first = buildBacktestReproducibilityFingerprint(base);
    const second = buildBacktestReproducibilityFingerprint(changed);

    expect(second.outcomes).not.toBe(first.outcomes);
    expect(second.combined).not.toBe(first.combined);
  });
});
