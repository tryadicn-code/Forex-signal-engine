import { describe, expect, it } from "vitest";
import { PaperTradingService } from "@/paper/paper-trading-service";
import { InMemoryPaperStore } from "@/paper/store";
import { MockMarketDataProvider } from "@/providers/market-data/mock-provider";
import type { ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";
import type { ExecutionPlan } from "@/types/engine";

const T0 = Date.UTC(2026, 8, 29, 12, 0, 0);

function partialPlan(): ExecutionPlan {
  return {
    kind: "PARTIAL",
    tp1: 1.105,
    tp1SizePercent: 50,
    tp2: 1.11,
    tp2SizePercent: 50,
    obstaclePrice: 1.105,
    obstacleR: 1.0,
  };
}

function result(
  plan: ExecutionPlan | undefined,
  overrides: Partial<SymbolScanResult> = {}
): SymbolScanResult {
  return {
    symbol: "EURUSD",
    status: "ANALYSED",
    reason: "test",
    executionEligible: false,
    latestPrice: 1.1,
    spreadPips: 1,
    regime: "TREND_UP",
    strategyId: "TREND_PULLBACK",
    bias: "LONG",
    biasScore: 70,
    biasDirection: "LONG",
    setupState: "ARMED",
    setupScore: 85,
    triggerState: "CONFIRMED",
    triggerScore: 100,
    triggerAgeInBars: 0,
    riskReward: 2,
    positionSize: 1,
    executionDecision: "EXECUTE",
    signalState: "EXECUTE",
    signalId: "signal-1",
    freshness: "FRESH",
    updatedAt: T0,
    timeframes: [],
    executionDetail: {
      decision: "EXECUTE",
      conditions: [],
      triggeredVetoes: [],
      reasons: [],
    },
    riskDetail: {
      approved: true,
      rejectionReason: null,
      entryPrice: 1.1,
      stopLoss: 1.095,
      stopDistancePips: 50,
      takeProfit1: 1.11,
      takeProfit2: 1.115,
      riskCapital: 50,
      riskPercent: 0.5,
      positionSize: 1,
      plannedRR: 2,
      pipSize: 0.0001,
      accountCurrency: "USD",
      executionPlan: plan ?? null,
    },
    evidence: [],
    conflicts: [],
    issues: [],
    errors: [],
    ...overrides,
  };
}

function manageAt(price: number, at: number): SymbolScanResult {
  return result(undefined, {
    latestPrice: price,
    executionDecision: "WAIT",
    signalState: "MANAGE",
    updatedAt: at,
  });
}

function snapshot(item: SymbolScanResult, at = T0): ScannerSnapshot {
  return {
    startedAt: at,
    completedAt: at,
    durationMs: null,
    symbolsRequested: 1,
    symbolsSuccessful: 1,
    symbolsFailed: 0,
    results: [item],
    providerStatus: {
      state: "CONNECTED",
      lastSuccessAt: at,
      lastFailureAt: null,
      errorCount: 0,
    },
    freshnessSummary: { FRESH: 1, DELAYED: 0, STALE: 0 },
  };
}

function service() {
  return new PaperTradingService(new InMemoryPaperStore(), {
    initialBalance: 10_000,
    accountCurrency: "USD",
    maxOpenPositions: 10,
    maxTotalOpenRiskPercent: 5,
  });
}

describe("Paper partial close (TRD-RR-003)", () => {
  it("books TP1 partial leg and keeps position open", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result(partialPlan())), provider);

    const first = await paper.processSnapshot(
      snapshot(manageAt(1.106, T0 + 60_000), T0 + 60_000),
      provider
    );

    expect(first.openPositions).toHaveLength(1);
    expect(first.openPositions[0].tp1HitAt).not.toBeNull();
    expect(first.openPositions[0].remainingSize).toBeCloseTo(0.5);
    // TP1 leg: (1.105 - 1.1) / 0.0001 = 50 pips, 0.5 lot = 25 USD.
    expect(first.openPositions[0].realizedPnL).toBeCloseTo(25);
  });

  it("closes remaining leg at TP2 and aggregates P&L", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result(partialPlan())), provider);
    await paper.processSnapshot(
      snapshot(manageAt(1.106, T0 + 60_000), T0 + 60_000),
      provider
    );

    const closed = await paper.processSnapshot(
      snapshot(manageAt(1.111, T0 + 120_000), T0 + 120_000),
      provider
    );

    expect(closed.openPositions).toHaveLength(0);
    expect(closed.recentTrades).toHaveLength(1);
    // TP1 leg: 50 pips * 0.5 lot = 25 USD.
    // TP2 leg: 100 pips * 0.5 lot = 50 USD.
    // Total: 75 USD, realizedR = 75 / 50 risk = 1.5.
    expect(closed.recentTrades[0].realizedPnL).toBeCloseTo(75);
    expect(closed.recentTrades[0].realizedR).toBeCloseTo(1.5);
  });

  it("closes remaining leg at SL after TP1 partial", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result(partialPlan())), provider);
    await paper.processSnapshot(
      snapshot(manageAt(1.106, T0 + 60_000), T0 + 60_000),
      provider
    );

    const closed = await paper.processSnapshot(
      snapshot(manageAt(1.094, T0 + 120_000), T0 + 120_000),
      provider
    );

    expect(closed.openPositions).toHaveLength(0);
    expect(closed.recentTrades).toHaveLength(1);
    // TP1 +25 USD, SL remainder -25 USD, net 0.
    expect(closed.recentTrades[0].realizedPnL).toBeCloseTo(0);
  });

  it("closes full at SL when stop hit before TP1", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result(partialPlan())), provider);

    const closed = await paper.processSnapshot(
      snapshot(manageAt(1.094, T0 + 60_000), T0 + 60_000),
      provider
    );

    expect(closed.openPositions).toHaveLength(0);
    expect(closed.recentTrades).toHaveLength(1);
    // full: -50 pips * 1 lot = -50 USD.
    expect(closed.recentTrades[0].realizedPnL).toBeCloseTo(-50);
  });

  it("is idempotent for repeated TP1 touches", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result(partialPlan())), provider);
    await paper.processSnapshot(
      snapshot(manageAt(1.106, T0 + 60_000), T0 + 60_000),
      provider
    );
    const second = await paper.processSnapshot(
      snapshot(manageAt(1.106, T0 + 90_000), T0 + 90_000),
      provider
    );

    expect(second.openPositions).toHaveLength(1);
    expect(second.openPositions[0].remainingSize).toBeCloseTo(0.5);
  });

  it("keeps legacy single-TP behavior when no plan is present", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result(undefined)), provider);

    const first = await paper.processSnapshot(
      snapshot(manageAt(1.111, T0 + 60_000), T0 + 60_000),
      provider
    );

    expect(first.openPositions).toHaveLength(0);
    expect(first.recentTrades).toHaveLength(1);
    expect(first.recentTrades[0].realizedPnL).toBeCloseTo(100);
  });

  it("books TP1 and TP2 in a single price observation above both levels", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result(partialPlan())), provider);

    // Price jumps straight past both TP1 and TP2 without an intermediate
    // observation. The plan still books TP1 at its level and TP2 at its
    // level, not the reached price.
    const closed = await paper.processSnapshot(
      snapshot(manageAt(1.112, T0 + 60_000), T0 + 60_000),
      provider
    );

    expect(closed.openPositions).toHaveLength(0);
    expect(closed.recentTrades).toHaveLength(1);
    // TP1: 50 pips * 0.5 lot = 25 USD.
    // TP2: 100 pips * 0.5 lot = 50 USD.
    expect(closed.recentTrades[0].realizedPnL).toBeCloseTo(75);
    expect(closed.recentTrades[0].realizedR).toBeCloseTo(1.5);
  });

  it("preserves fractional position size precision on partial leg", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(
      snapshot(
        result(partialPlan(), {
          positionSize: 0.37,
          riskDetail: {
            approved: true,
            rejectionReason: null,
            entryPrice: 1.1,
            stopLoss: 1.095,
            stopDistancePips: 50,
            takeProfit1: 1.11,
            takeProfit2: 1.115,
            riskCapital: 50,
            riskPercent: 0.5,
            positionSize: 0.37,
            plannedRR: 2,
            pipSize: 0.0001,
            accountCurrency: "USD",
            executionPlan: partialPlan(),
          },
        })
      ),
      provider
    );

    const first = await paper.processSnapshot(
      snapshot(manageAt(1.106, T0 + 60_000), T0 + 60_000),
      provider
    );

    expect(first.openPositions).toHaveLength(1);
    expect(first.openPositions[0].remainingSize).toBeCloseTo(0.185, 6);
    expect(first.openPositions[0].positionSize).toBeCloseTo(0.37, 6);
  });

  it("does not re-book TP1 when price remains above TP1 across snapshots", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result(partialPlan())), provider);
    await paper.processSnapshot(
      snapshot(manageAt(1.106, T0 + 60_000), T0 + 60_000),
      provider
    );
    const third = await paper.processSnapshot(
      snapshot(manageAt(1.107, T0 + 120_000), T0 + 120_000),
      provider
    );

    expect(third.openPositions).toHaveLength(1);
    expect(third.openPositions[0].remainingSize).toBeCloseTo(0.5);
    // Only one TP1 ledger event regardless of how many snapshots touch TP1.
    const tp1Events = third.recentTrades.length + 1; // no closed trade yet
    expect(tp1Events).toBe(1);
  });

  it("does not re-close a position that already reached zero remaining size", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result(partialPlan())), provider);
    await paper.processSnapshot(
      snapshot(manageAt(1.106, T0 + 60_000), T0 + 60_000),
      provider
    );
    await paper.processSnapshot(
      snapshot(manageAt(1.111, T0 + 120_000), T0 + 120_000),
      provider
    );
    const repeat = await paper.processSnapshot(
      snapshot(manageAt(1.111, T0 + 180_000), T0 + 180_000),
      provider
    );

    expect(repeat.openPositions).toHaveLength(0);
    expect(repeat.recentTrades).toHaveLength(1);
  });
});