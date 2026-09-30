import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import type { HistoricalTrade } from "@/replay/execution-types";
import {
  buildBacktestReproducibilityFingerprint,
} from "@/replay/robustness-validation";
import {
  assertArtifactEligibleForStrategyRegistration,
  buildStrategyVersionManifest,
  normalizeStrategyVersion,
  verifyStrategyVersionManifest,
} from "@/replay/strategy-version-registry";
import { JsonFileStrategyVersionStore } from "@/server/strategy-version-store";

const DAY = 24 * 60 * 60_000;
const START = Date.UTC(2026, 0, 1);
const END = START + 100 * DAY;
const tempPaths: string[] = [];

function trade(id: string, day: number, pnl: number, r: number): HistoricalTrade {
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
    openedAt: START + day * DAY,
    closedAt: START + (day + 1) * DAY,
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

  const base: BacktestRunArtifact = {
    schemaVersion: 1,
    id: "backtest-version-registry-test",
    createdAt: 1,
    completedAt: 2,
    durationMs: 1,
    config: {
      datasetId: "registry-test",
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
      datasetId: "registry-test",
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
        bySymbol: [],
        byDirection: [],
        byBias: [],
        bySetupScore: [],
        byEntrySession: [],
        byCloseReason: [],
      },
    },
  };

  const fingerprint = buildBacktestReproducibilityFingerprint(base).combined;
  base.releaseReview = {
    decision: "PROMOTE",
    reviewer: "reviewer-1",
    note: "approved for registry test",
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
    updatedAt: 123,
  };
  return base;
}

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map((item) =>
      fs.rm(item, { recursive: true, force: true })
    )
  );
});

describe("Phase 5.9 strategy manifest", () => {
  it("normalizes semantic versions", () => {
    expect(normalizeStrategyVersion("1.2.3")).toBe("v1.2.3");
    expect(normalizeStrategyVersion("v2.0.1")).toBe("v2.0.1");
    expect(() => normalizeStrategyVersion("release-1")).toThrow(/semantic version/);
  });

  it("requires a current manual PROMOTE release review", () => {
    const source = artifact();
    expect(() => assertArtifactEligibleForStrategyRegistration(source)).not.toThrow();

    source.releaseReview!.decision = "HOLD";
    expect(() => assertArtifactEligibleForStrategyRegistration(source)).toThrow(
      /manual PROMOTE/
    );
  });

  it("creates a self-contained immutable manifest with strategy snapshot", () => {
    const source = artifact();
    const manifest = buildStrategyVersionManifest(
      source,
      {
        version: "v1.0.0",
        title: "FSE validated baseline",
        note: "Phase 5 completion baseline",
        registeredBy: "registry-owner",
        sourceReportId: source.id,
      },
      999
    );

    expect(manifest.version).toBe("v1.0.0");
    expect(manifest.registeredAt).toBe(999);
    expect(manifest.reviewedFingerprint).toBe(source.releaseReview?.reviewedFingerprint);
    expect(manifest.strategySnapshot.engineConfig.trigger.minTriggerScore).toBe(80);
    expect(manifest.strategySnapshot.scanner.timeframeRoles.trigger).toBe("M15");
    expect(manifest.validationSummary.protocol).toBe("phase-5.7-v1");
    expect(manifest.releaseGateAudit.protocol).toBe("phase-5.8-v1");
    expect(verifyStrategyVersionManifest(manifest)).toBe(true);

    manifest.title = "tampered";
    expect(verifyStrategyVersionManifest(manifest)).toBe(false);
  });
});

describe("Phase 5.9 strategy registry lifecycle", () => {
  it("keeps one ACTIVE version and requires explicit supersession", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-registry-"));
    tempPaths.push(dir);
    const store = new JsonFileStrategyVersionStore(
      path.join(dir, "registry.json")
    );
    const source = artifact();
    const firstInput = {
      version: "v1.0.0",
      title: "Baseline",
      note: "",
      registeredBy: "owner",
      sourceReportId: source.id,
    };
    const first = buildStrategyVersionManifest(source, firstInput, 1000);
    let registry = await store.register(first, firstInput);

    expect(registry.entries[0].currentStatus).toBe("ACTIVE");

    const secondInput = {
      version: "v1.1.0",
      title: "Next",
      note: "",
      registeredBy: "owner",
      sourceReportId: source.id,
    };
    const second = buildStrategyVersionManifest(source, secondInput, 2000);

    await expect(store.register(second, secondInput)).rejects.toThrow(
      /Explicitly supersede/
    );

    registry = await store.register(second, {
      ...secondInput,
      supersedesVersion: "v1.0.0",
    });

    expect(
      registry.entries.find((entry) => entry.manifest.version === "v1.1.0")
        ?.currentStatus
    ).toBe("ACTIVE");
    expect(
      registry.entries.find((entry) => entry.manifest.version === "v1.0.0")
        ?.currentStatus
    ).toBe("SUPERSEDED");
  });

  it("changes lifecycle status without mutating the immutable manifest", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-registry-"));
    tempPaths.push(dir);
    const store = new JsonFileStrategyVersionStore(
      path.join(dir, "registry.json")
    );
    const source = artifact();
    const input = {
      version: "v1.0.0",
      title: "Baseline",
      note: "",
      registeredBy: "owner",
      sourceReportId: source.id,
    };
    const manifest = buildStrategyVersionManifest(source, input, 1000);
    await store.register(manifest, input);

    const before = (await store.read()).entries[0].manifest;
    const registry = await store.deprecate({
      version: "v1.0.0",
      changedBy: "owner",
      reason: "Retired after validation cycle.",
    });
    const entry = registry.entries[0];

    expect(entry.currentStatus).toBe("DEPRECATED");
    expect(entry.manifest).toEqual(before);
    expect(entry.statusHistory).toHaveLength(2);
    await expect(
      store.deprecate({
        version: "v1.0.0",
        changedBy: "owner",
        reason: "again",
      })
    ).rejects.toThrow(/already DEPRECATED/);
  });
});
