import { describe, expect, it } from "vitest";
import { PaperTradingService } from "@/paper/paper-trading-service";
import { InMemoryPaperStore } from "@/paper/store";
import { MockMarketDataProvider } from "@/providers/market-data/mock-provider";
import type { ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";

const T0 = Date.UTC(2026, 8, 29, 12, 0, 0);

function result(overrides: Partial<SymbolScanResult> = {}): SymbolScanResult {
  return {
    symbol: "EURUSD",
    status: "ANALYSED",
    reason: "test",
    latestPrice: 1.1,
    spreadPips: 1,
    regime: "TREND_UP",
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
    },
    evidence: [],
    conflicts: [],
    issues: [],
    errors: [],
    ...overrides,
  };
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

describe("PaperTradingService", () => {
  it("opens exactly one paper position for repeated EXECUTE refreshes", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();

    const first = await paper.processSnapshot(snapshot(result()), provider);
    const second = await paper.processSnapshot(snapshot(result()), provider);

    expect(first.openPositions).toHaveLength(1);
    expect(second.recentOrders).toHaveLength(1);
  });

  it("does not create a paper order for ENGINE EXECUTE when lifecycle is not EXECUTE", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    const closed = result({ signalState: "CLOSED" });

    const data = await paper.processSnapshot(snapshot(closed), provider);

    expect(data.openPositions).toHaveLength(0);
    expect(data.recentOrders).toHaveLength(0);
  });

  it("reconciles the legacy lifecycle-mismatch rejection once the same signal becomes actionable", async () => {
    const store = new InMemoryPaperStore();
    const paper = new PaperTradingService(store, {
      initialBalance: 10_000,
      accountCurrency: "USD",
      maxOpenPositions: 10,
      maxTotalOpenRiskPercent: 5,
    });
    const provider = new MockMarketDataProvider();

    // Seed the exact legacy rejection produced by the pre-fix integration.
    await store.save({
      schemaVersion: 1,
      account: { currency: "USD", initialBalance: 10_000, createdAt: T0 },
      orders: [{
        id: "order-signal-1",
        executionKey: "paper:signal-1",
        signalId: "signal-1",
        symbol: "EURUSD",
        side: "LONG",
        requestedAt: T0,
        filledAt: null,
        requestedEntry: 1.1,
        fillPrice: null,
        stopLoss: 1.095,
        takeProfit: 1.11,
        positionSize: 1,
        riskAmount: 50,
        riskPercent: 0.5,
        plannedRR: 2,
        status: "REJECTED",
        rejectionReason: "PAPER_SIGNAL_STATE_NOT_EXECUTE",
        engine: {
          bias: "LONG",
          setupScore: 85,
          executionDecision: "EXECUTE",
          freshness: "FRESH",
          engineVersion: "phase-4",
          paperConfigVersion: "phase-4.1",
        },
      }],
      positions: [],
      trades: [],
      ledger: [],
    });

    const data = await paper.processSnapshot(snapshot(result(), T0 + 1), provider);

    expect(data.openPositions).toHaveLength(1);
    expect(data.recentOrders).toHaveLength(1);
    expect(data.recentOrders[0].status).toBe("FILLED");
    expect(data.recentOrders[0].rejectionReason).toBeNull();
  });

  it("fails closed when an EXECUTE-shaped input is stale", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    const stale = result({ freshness: "STALE" });

    const data = await paper.processSnapshot(snapshot(stale), provider);

    expect(data.openPositions).toHaveLength(0);
    expect(data.recentOrders).toHaveLength(1);
    expect(data.recentOrders[0].status).toBe("REJECTED");
    expect(data.recentOrders[0].rejectionReason).toBe("PAPER_MARKET_DATA_NOT_FRESH");
  });

  it("closes a LONG at TP once and realizes +2R", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result()), provider);

    const next = result({
      latestPrice: 1.111,
      executionDecision: "WAIT",
      signalState: "MANAGE",
    });
    const closed = await paper.processSnapshot(snapshot(next, T0 + 60_000), provider);
    const repeated = await paper.processSnapshot(snapshot(next, T0 + 120_000), provider);

    expect(closed.openPositions).toHaveLength(0);
    expect(closed.recentTrades).toHaveLength(1);
    expect(closed.recentTrades[0].realizedPnL).toBeCloseTo(100);
    expect(closed.recentTrades[0].realizedR).toBeCloseTo(2);
    expect(closed.account.balance).toBeCloseTo(10_100);
    expect(repeated.recentTrades).toHaveLength(1);
  });

  it("reset restores the initial paper account and clears history", async () => {
    const paper = service();
    const provider = new MockMarketDataProvider();
    await paper.processSnapshot(snapshot(result()), provider);

    const reset = await paper.reset(T0 + 1);

    expect(reset.account.balance).toBe(10_000);
    expect(reset.openPositions).toHaveLength(0);
    expect(reset.recentTrades).toHaveLength(0);
    expect(reset.recentOrders).toHaveLength(0);
  });
});
