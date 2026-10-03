import { describe, expect, it } from "vitest";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import type { HistoricalTrade } from "@/replay/execution-types";
import {
  buildReleaseEvidenceReview,
  buildReleaseGateAuditRecord,
  isReleaseReviewCurrent,
  validateReleaseReviewForPersistence,
} from "@/replay/release-gate";
import {
  buildBacktestReproducibilityFingerprint,
} from "@/replay/robustness-validation";
import {
  DEFAULT_RELEASE_GATE_THRESHOLDS,
  type ReleaseGateThresholds,
} from "@/replay/release-gate-config";
import type { BacktestReleaseReview } from "@/replay/release-gate-types";

const DAY = 24 * 60 * 60_000;
const START = Date.UTC(2026, 0, 1);
const END = START + 100 * DAY;

/**
 * B3-H3: thresholds used by tests that exercise checklist / evidence logic
 * but are not themselves testing the quantitative gate. Passing these as
 * the third argument isolates checklist behaviour from statistical
 * thresholds, so a change to one does not break the other.
 */
const PERMISSIVE_THRESHOLDS: ReleaseGateThresholds = {
  minOutOfSampleSampleSize: 0,
  minOutOfSampleExpectancyR: -Infinity,
  minOutOfSampleProfitFactor: 0,
  maxEquityDrawdownPercent: 100,
  minPositiveSequentialFolds: 0,
  blockOnSampleWarnings: false,
  numberOfDevelopmentTrials: 1,
  multipleTestingAlpha: 0.05,
};

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
    trade("t2", 25, -50, -1),
    trade("t3", 45, 50, 1),
    trade("t4", 65, -50, -1),
    trade("t5", 75, 100, 2),
    trade("t6", 85, -50, -1),
    trade("t7", 95, 50, 1),
  ];

  return {
    schemaVersion: 1,
    id: "backtest-release-gate-test",
    createdAt: 1,
    completedAt: 2,
    durationMs: 1,
    config: {
      datasetId: "release-gate-test",
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
      datasetId: "release-gate-test",
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
      balance: 10_150,
      equity: 10_150,
      realizedPnL: 150,
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
      losses: 3,
      breakEven: 0,
      winRate: (4 / 7) * 100,
      lossRate: (3 / 7) * 100,
      initialBalance: 10_000,
      finalBalance: 10_150,
      netPnL: 150,
      netReturnPercent: 1.5,
      grossProfit: 300,
      grossLoss: -150,
      averageWin: 75,
      averageLoss: 50,
      payoffRatio: 1.5,
      profitFactor: 2,
      expectancyAmount: 150 / 7,
      netR: 3,
      averageR: 3 / 7,
      medianR: 1,
      standardDeviationR: 1,
      expectancyR: 3 / 7,
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
      maxEquityDrawdownAt: START + 26 * DAY,
      currentEquityDrawdownAmount: 0,
      currentEquityDrawdownPercent: 0,
      maxBalanceDrawdownAmount: 50,
      maxBalanceDrawdownPercent: 0.5,
      maxBalanceDrawdownAt: START + 26 * DAY,
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

function review(
  source: BacktestRunArtifact,
  overrides: Partial<BacktestReleaseReview> = {}
): BacktestReleaseReview {
  const fingerprint =
    buildBacktestReproducibilityFingerprint(source).combined;
  return {
    decision: "PENDING",
    reviewer: "reviewer-1",
    note: "",
    checklist: {
      datasetQualityReviewed: true,
      assumptionsReviewed: true,
      reproducibilityReviewed: true,
      outOfSampleReviewed: true,
      statisticsReviewed: true,
      forwardPaper: "WAIVED",
    },
    reviewedFingerprint: fingerprint,
    forwardEvidence: null,
    updatedAt: 1,
    ...overrides,
  };
}

describe("Phase 5.8 release evidence review", () => {
  it("surfaces evidence without generating an automatic decision", () => {
    const result = buildReleaseEvidenceReview(artifact());

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.find((item) => item.id === "forward-paper")?.status)
      .toBe("MISSING");
    expect(result.counts.ATTENTION).toBeGreaterThan(0);
  });

  it("requires all manual core checklist items before PROMOTE", () => {
    const source = artifact();
    const incomplete = review(source, {
      decision: "PROMOTE",
      checklist: {
        ...review(source).checklist,
        statisticsReviewed: false,
      },
    });

    expect(() =>
      validateReleaseReviewForPersistence(source, incomplete)
    ).toThrow(/every core manual review checkbox/);
  });

  it("allows manual PROMOTE when core review is complete and forward is explicitly waived", () => {
    const source = artifact();
    const complete = review(source, { decision: "PROMOTE" });

    expect(() =>
      validateReleaseReviewForPersistence(
        source,
        complete,
        PERMISSIVE_THRESHOLDS
      )
    ).not.toThrow();
  });

  it("blocks PROMOTE with default thresholds when OOS sample is too small", () => {
    const source = artifact();
    const complete = review(source, { decision: "PROMOTE" });
    expect(() =>
      validateReleaseReviewForPersistence(
        source,
        complete,
        DEFAULT_RELEASE_GATE_THRESHOLDS
      )
    ).toThrow(/PROMOTE blocked by quantitative release gate/);
  });

  it("allows PROMOTE when permissive thresholds override the default gate", () => {
    const source = artifact();
    const complete = review(source, { decision: "PROMOTE" });
    expect(() =>
      validateReleaseReviewForPersistence(
        source,
        complete,
        PERMISSIVE_THRESHOLDS
      )
    ).not.toThrow();
  });

  it("rejects a custom threshold that requires more OOS trades than available", () => {
    const source = artifact();
    const complete = review(source, { decision: "PROMOTE" });
    const strict: ReleaseGateThresholds = {
      ...PERMISSIVE_THRESHOLDS,
      minOutOfSampleSampleSize: 1000,
    };
    expect(() =>
      validateReleaseReviewForPersistence(source, complete, strict)
    ).toThrow(/Out-of-sample sample size/);
  });

  it("requires captured evidence when Forward Paper is marked REVIEWED", () => {
    const source = artifact();
    const invalid = review(source, {
      checklist: {
        ...review(source).checklist,
        forwardPaper: "REVIEWED",
      },
    });

    expect(() =>
      validateReleaseReviewForPersistence(source, invalid)
    ).toThrow(/captured comparison snapshot/);
  });

  it("marks a stored review stale after assumptions change", () => {
    const source = artifact();
    source.releaseReview = review(source);
    expect(isReleaseReviewCurrent(source)).toBe(true);

    source.config.assumedSpreadPips = 1.5;
    expect(isReleaseReviewCurrent(source)).toBe(false);
  });

  it("exports an auditable release-gate record without inventing a decision", () => {
    const source = artifact();
    let record = buildReleaseGateAuditRecord(source);

    expect(record.protocol).toBe("phase-5.8-v1");
    expect(record.review).toBeNull();
    expect(record.reviewCurrent).toBe(false);
    expect(record.fingerprint).toMatch(/^[a-f0-9]{16}$/);

    source.releaseReview = review(source, { decision: "HOLD" });
    record = buildReleaseGateAuditRecord(source);

    expect(record.review?.decision).toBe("HOLD");
    expect(record.reviewCurrent).toBe(true);
    expect(record.evidence.fingerprint).toBe(record.fingerprint);
  });

  it("ignores organizational label changes when checking review freshness", () => {
    const source = artifact();
    source.releaseReview = review(source);
    source.metadata = {
      label: "renamed",
      tags: ["reviewed"],
      updatedAt: 99,
    };

    expect(isReleaseReviewCurrent(source)).toBe(true);
  });
});
