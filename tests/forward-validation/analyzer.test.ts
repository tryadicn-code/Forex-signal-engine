import { describe, expect, it } from "vitest";
import { buildForwardValidationReport } from "@/forward-validation/analyzer";
import type { ForwardValidationObservation } from "@/forward-validation/types";
import type { PaperStoreState, PaperTrade } from "@/paper/types";
import type { StrategyVersionManifest } from "@/replay/strategy-version-types";

const T0 = Date.UTC(2026, 8, 30, 0, 0, 0);
const ACTIVATION = T0 - 60_000;
const FP = "abcdef1234567890";

function manifest(): StrategyVersionManifest {
  return {
    schemaVersion: 1,
    protocol: "phase-5.9-v1",
    version: "v1.0.0",
    title: "Forward baseline",
    note: "",
    registeredAt: ACTIVATION,
    registeredBy: "owner",
    sourceReportId: "report-1",
    sourceDatasetId: "dataset-1",
    symbols: ["EURUSD"],
    validationWindow: {
      startAt: T0 - 100 * 24 * 60 * 60_000,
      endAt: T0 - 24 * 60 * 60_000,
    },
    releaseReviewer: "reviewer",
    releaseReviewedAt: ACTIVATION,
    reviewedFingerprint: "review-fp",
    reproducibility: {
      assumptions: "assumptions",
      outcomes: "outcomes",
      combined: "combined",
    },
    strategySnapshot: {} as never,
    validationSummary: {
      schemaVersion: 1,
      protocol: "phase-5.7-v1",
      report: {
        id: "report-1",
        label: "baseline",
        tags: [],
        datasetId: "dataset-1",
        source: "synthetic",
        symbols: ["EURUSD"],
        startAt: T0 - 100 * 24 * 60 * 60_000,
        endAt: T0 - 24 * 60 * 60_000,
      },
      assumptions: {
        sourceUtcOffsetMinutes: 0,
        assumedSpreadPips: 1,
        initialBalance: 10_000,
        riskPercent: 0.5,
        maxOpenPositions: 10,
        maxTotalOpenRiskPercent: 5,
        intrabarConflictPolicy: "STOP_FIRST",
      },
      reproducibility: {
        protocolVersion: "phase-5",
        algorithm: "test",
        assumptions: "assumptions",
        outcomes: "outcomes",
        combined: "combined",
      },
      corePerformance: {
        sampleSize: 100,
        winRate: 60,
        profitFactor: 2,
        expectancyR: 0.4,
        averageR: 0.4,
        netR: 40,
        netReturnPercent: 20,
        maxEquityDrawdownPercent: 8,
      },
      holdout70_30: {
        splitAt: T0 - 50 * 24 * 60 * 60_000,
        inSampleSampleSize: 70,
        outOfSampleSampleSize: 30,
        inSampleExpectancyR: 0.4,
        outOfSampleExpectancyR: 0.35,
        inSampleWinRate: 60,
        outOfSampleWinRate: 58,
      },
      sequential4Fold: {
        foldCount: 4,
        foldsWithTrades: 4,
        emptyFolds: 0,
        validationTradeCount: 100,
        positiveExpectancyFolds: 4,
        nonPositiveExpectancyFolds: 0,
        expectancyRMean: 0.4,
        expectancyRStandardDeviation: 0.1,
      },
      statisticalDiagnostics: {
        sampleSize: 100,
        winRateWilson95: {
          confidenceLevel: 0.95,
          estimate: 60,
          lower: 50,
          upper: 70,
        },
        expectancyRBootstrap95: {
          iterations: 2000,
          seed: 1,
          interval: {
            confidenceLevel: 0.95,
            estimate: 0.4,
            lower: 0.1,
            upper: 0.7,
          },
          positiveResampleFraction: 0.95,
        },
        tradeOrderMonteCarlo: {
          iterations: 2000,
          seed: 2,
          observedMaxDrawdownR: 3,
          medianMaxDrawdownR: 3.5,
          p90MaxDrawdownR: 4.5,
          p95MaxDrawdownR: 5,
          p99MaxDrawdownR: 6,
          worstMaxDrawdownR: 8,
        },
        sampleWarnings: [],
      },
      interpretationNotes: [],
    },
    releaseGateAudit: {} as never,
    manifestFingerprint: FP,
  };
}

function trade(
  id: string,
  r: number,
  activationAt = ACTIVATION,
  version = "v1.0.0",
  fingerprint = FP
): PaperTrade {
  const pnl = r * 50;
  return {
    id,
    orderId: "order-" + id,
    positionId: "position-" + id,
    signalId: "signal-" + id,
    symbol: "EURUSD",
    side: "LONG",
    entryPrice: 1.1,
    exitPrice: r >= 0 ? 1.11 : 1.095,
    stopLoss: 1.095,
    takeProfit: 1.11,
    positionSize: 1,
    riskAmount: 50,
    riskPercent: 0.5,
    plannedRR: 2,
    realizedPnL: pnl,
    realizedPnLPercent: pnl / 100,
    realizedR: r,
    openedAt: T0 + Number(id.replace(/\D/g, "") || 0) * 60_000,
    closedAt:
      T0 + Number(id.replace(/\D/g, "") || 0) * 60_000 + 30_000,
    holdingDurationMs: 30_000,
    closeReason: pnl >= 0 ? "TAKE_PROFIT" : "STOP_LOSS",
    engine: {
      bias: "LONG",
      setupScore: 85,
      executionDecision: "EXECUTE",
      freshness: "FRESH",
      engineVersion: "phase-4",
      paperConfigVersion: "phase-4.1",
      strategyVersion: version,
      strategyManifestFingerprint: fingerprint,
      strategySourceReportId: "report-1",
      strategyActivationAt: activationAt,
    },
  };
}

function paper(trades: PaperTrade[]): PaperStoreState {
  return {
    schemaVersion: 1,
    account: {
      currency: "USD",
      initialBalance: 10_000,
      createdAt: T0 - 1000,
    },
    orders: [],
    positions: [],
    trades,
    ledger: [],
  };
}

function observation(
  overrides: Partial<ForwardValidationObservation> = {}
): ForwardValidationObservation {
  return {
    id: "obs-1",
    observedAt: T0,
    strategyVersion: "v1.0.0",
    manifestFingerprint: FP,
    activationAt: ACTIVATION,
    sourceReportId: "report-1",
    providerState: "CONNECTED",
    symbolsRequested: 10,
    symbolsSuccessful: 10,
    symbolsFailed: 0,
    freshness: {
      fresh: 10,
      delayed: 0,
      stale: 0,
    },
    engineExecuteCount: 1,
    lifecycleExecuteCount: 1,
    paperFilledCount: 1,
    paperRejectedCount: 0,
    ...overrides,
  };
}

describe("Phase 7 forward validation analyzer", () => {
  it("isolates trades and observations by exact release activation epoch", () => {
    const report = buildForwardValidationReport({
      manifest: manifest(),
      activationAt: ACTIVATION,
      paper: paper([
        trade("1", 1),
        trade("2", -1, ACTIVATION - 10_000),
        trade("3", 1, ACTIVATION, "v1.1.0"),
        trade("4", 1, ACTIVATION, "v1.0.0", "other-fingerprint"),
      ]),
      observations: [
        observation(),
        observation({
          id: "old-epoch",
          activationAt: ACTIVATION - 10_000,
          observedAt: T0 + 60_000,
        }),
      ],
      config: { minimumTradeSample: 1 },
      generatedAt: T0 + 120_000,
    });

    expect(report.sample.tradeCount).toBe(1);
    expect(report.operational.observationCount).toBe(1);
    expect(report.release.activationAt).toBe(ACTIVATION);
  });

  it("uses preserved historical statistical ranges instead of inventing a forward verdict", () => {
    const trades = Array.from({ length: 30 }, (_, index) =>
      trade(String(index + 1), index % 2 === 0 ? 1 : -0.2)
    );
    const report = buildForwardValidationReport({
      manifest: manifest(),
      activationAt: ACTIVATION,
      paper: paper(trades),
      observations: [observation()],
      generatedAt: T0 + 1_000_000,
    });

    expect(report.status).toBe("MONITORING");
    expect(
      report.indicators.find((item) => item.id === "win-rate")?.status
    ).toBe("WITHIN_REFERENCE");
    expect(
      report.indicators.find((item) => item.id === "expectancy-r")?.status
    ).toBe("WITHIN_REFERENCE");
    expect(report.interpretationNotes.join(" ")).toMatch(/descriptive/i);
  });

  it("surfaces performance and data-quality attention without changing strategy state", () => {
    const trades = Array.from({ length: 30 }, (_, index) =>
      trade(String(index + 1), index < 3 ? 1 : -1)
    );
    const report = buildForwardValidationReport({
      manifest: manifest(),
      activationAt: ACTIVATION,
      paper: paper(trades),
      observations: [
        observation({
          symbolsRequested: 10,
          symbolsSuccessful: 7,
          symbolsFailed: 3,
          freshness: {
            fresh: 6,
            delayed: 0,
            stale: 4,
          },
        }),
      ],
      generatedAt: T0 + 1_000_000,
    });

    expect(report.status).toBe("ATTENTION");
    expect(
      report.indicators.some(
        (item) => item.status === "OUTSIDE_REFERENCE"
      )
    ).toBe(true);
    expect(
      report.indicators.find(
        (item) => item.id === "provider-failure-rate"
      )?.status
    ).toBe("ATTENTION");
    expect(
      report.indicators.find((item) => item.id === "stale-data-rate")
        ?.status
    ).toBe("ATTENTION");
  });

  it("uses the recent trade window for drift indicators while preserving cumulative metrics", () => {
    const olderBad = Array.from({ length: 10 }, (_, index) =>
      trade(String(index + 1), -1)
    );
    const recentGood = Array.from({ length: 30 }, (_, index) =>
      trade(String(index + 11), index % 2 === 0 ? 1 : -0.2)
    );

    const report = buildForwardValidationReport({
      manifest: manifest(),
      activationAt: ACTIVATION,
      paper: paper([...olderBad, ...recentGood]),
      observations: [observation()],
      generatedAt: T0 + 1_000_000,
    });

    expect(report.sample.tradeCount).toBe(40);
    expect(report.monitoringWindow.tradeCount).toBe(30);
    expect(report.forward.expectancyR).not.toBe(
      report.monitoringWindow.forward.expectancyR
    );
    expect(
      report.indicators.find((item) => item.id === "expectancy-r")?.status
    ).toBe("WITHIN_REFERENCE");
  });

  it("keeps small samples explicitly in COLLECTING state", () => {
    const report = buildForwardValidationReport({
      manifest: manifest(),
      activationAt: ACTIVATION,
      paper: paper([trade("1", 2), trade("2", -1)]),
      observations: [observation()],
      generatedAt: T0 + 1_000_000,
    });

    expect(report.status).toBe("COLLECTING");
    expect(report.counts.insufficient).toBeGreaterThan(0);
  });
});
