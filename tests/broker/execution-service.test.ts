import { describe, expect, it } from "vitest";
import { resolveBrokerExecutionConfig } from "@/config/broker";
import { TransactionalBrokerExecutionStore } from "@/broker/execution-store";
import { BrokerExecutionService } from "@/broker/execution-service";
import { ShadowBrokerProvider } from "@/broker/shadow-provider";
import type {
  BrokerOrderIntent,
  BrokerOrderResult,
  BrokerPosition,
  BrokerPreflightResult,
  BrokerProvider,
  BrokerReconciliationResult,
  BrokerStatus,
} from "@/broker/types";
import { MemoryTransactionalStateStore } from "@/transactional/memory-store";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type {
  ScannerSnapshot,
  SymbolScanResult,
} from "@/scanner/scanner-result";

class MockLiveBroker implements BrokerProvider {
  readonly id = "mt5";
  placeCalls = 0;
  throwOnPlace = false;
  positions: BrokerPosition[] = [];

  async status(): Promise<BrokerStatus> {
    return {
      providerId: "mt5",
      connected: true,
      tradeAllowed: true,
      expertTradingAllowed: true,
      terminalTradingAllowed: true,
      accountCurrency: "USD",
      balance: 10_000,
      equity: 10_000,
      message: "ready",
    };
  }

  async preflight(
    intent: BrokerOrderIntent
  ): Promise<BrokerPreflightResult> {
    return {
      ok: true,
      code: "0",
      message: "ok",
      bid: intent.expectedEntry - 0.0001,
      ask: intent.expectedEntry + 0.0001,
      normalizedVolume: intent.volume,
    };
  }

  async placeOrder(
    intent: BrokerOrderIntent
  ): Promise<BrokerOrderResult> {
    this.placeCalls += 1;
    if (this.throwOnPlace) throw new Error("socket lost");
    return {
      accepted: true,
      outcome: "FILLED",
      code: "10009",
      message: "done",
      clientTag: intent.clientTag,
      orderId: "10",
      dealId: "11",
      positionId: "12",
      filledPrice: intent.expectedEntry,
    };
  }

  async listOpenPositions(): Promise<BrokerPosition[]> {
    return structuredClone(this.positions);
  }

  async reconcile(
    clientTag: string
  ): Promise<BrokerReconciliationResult> {
    return {
      found: true,
      state: "HISTORY_DEAL",
      clientTag,
      orderId: "10",
      dealId: "11",
      positionId: "12",
      message: "found",
    };
  }
}

function liveConfig() {
  return resolveBrokerExecutionConfig({
    FSE_BROKER_MODE: "live",
    FSE_BROKER_PROVIDER: "mt5",
    FSE_LIVE_EXECUTION_ENABLED: "true",
    FSE_LIVE_EMERGENCY_STOP: "false",
    FSE_LIVE_ALLOWED_SYMBOLS: "EURUSD",
    FSE_LIVE_MAX_RISK_PERCENT: "0.25",
    FSE_LIVE_MAX_LOT: "0.10",
    FSE_LIVE_MAX_ORDERS_PER_CYCLE: "1",
    FSE_LIVE_MAX_OPEN_POSITIONS: "1",
    FSE_LIVE_MAX_EQUITY_DRAWDOWN_PERCENT: "2",
    FSE_LIVE_ARM_MAX_MINUTES: "10",
    FSE_LIVE_ARM_MAX_ORDERS: "1",
  });
}

function release(): ReleaseRuntimeState {
  return {
    status: "ACTIVE",
    reason: "ACTIVE_RELEASE",
    canScan: true,
    version: "1.0.0",
    title: "validated",
    manifestFingerprint: "fingerprint",
    sourceReportId: "backtest-test",
    activationAt: 1000,
    registryUpdatedAt: 1000,
    resolvedAt: 2000,
    pinned: true,
    defaultDrift: false,
    driftAreas: [],
    message: "active",
  };
}

function candidate(
  riskPercent = 0.2,
  signalId = "signal-1"
): SymbolScanResult {
  return {
    symbol: "EURUSD",
    status: "ANALYSED",
    reason: "ok",
    latestPrice: 1.1,
    spreadPips: 1,
    regime: null,
    bias: null,
    biasScore: 80,
    biasDirection: "LONG",
    setupState: null,
    setupScore: 80,
    triggerState: null,
    triggerScore: 90,
    triggerAgeInBars: 0,
    riskReward: 2,
    positionSize: 0.05,
    executionDecision: "EXECUTE",
    signalState: "EXECUTE",
    signalId,
    freshness: "FRESH",
    updatedAt: 2000,
    timeframes: [],
    executionDetail: null,
    riskDetail: {
      approved: true,
      rejectionReason: null,
      entryPrice: 1.1,
      stopLoss: 1.095,
      stopDistancePips: 50,
      takeProfit1: 1.11,
      takeProfit2: 1.115,
      riskCapital: 20,
      riskPercent,
      positionSize: 0.05,
      plannedRR: 2,
      pipSize: 0.0001,
      accountCurrency: "USD",
    },
    evidence: [],
    conflicts: [],
    issues: [],
    errors: [],
  };
}

function snapshot(result = candidate()): ScannerSnapshot {
  return {
    startedAt: 2000,
    completedAt: 2100,
    durationMs: 100,
    symbolsRequested: 1,
    symbolsSuccessful: 1,
    symbolsFailed: 0,
    results: [result],
    providerStatus: null,
    freshnessSummary: {
      FRESH: 1,
      DELAYED: 0,
      STALE: 0,
    },
  };
}

function serviceWith(
  broker: MockLiveBroker,
  config = liveConfig()
) {
  const backend = new MemoryTransactionalStateStore();
  const store = new TransactionalBrokerExecutionStore(backend);
  const service = new BrokerExecutionService({
    store,
    provider: broker,
    config,
    sharedTransactional: true,
    lease: {
      async acquire() {
        return {
          fencingToken: 1,
          async release() {},
        };
      },
    },
  });
  return { service, store };
}

async function arm(service: BrokerExecutionService) {
  await service.setKillSwitch({
    engaged: false,
    changedBy: "tester",
    reason: "controlled test",
  });
  await service.armLive({
    approvedBy: "tester",
    reason: "controlled test",
    durationMinutes: 1,
    maxOrders: 1,
  });
}

describe("Phase 10 broker execution safety coordinator", () => {
  it("records shadow execution without external order transmission", async () => {
    const backend = new MemoryTransactionalStateStore();
    const store = new TransactionalBrokerExecutionStore(backend);
    const service = new BrokerExecutionService({
      store,
      provider: new ShadowBrokerProvider(),
      config: resolveBrokerExecutionConfig({
        FSE_BROKER_MODE: "shadow",
      }),
      sharedTransactional: false,
    });

    await service.processSnapshot(snapshot(), release());
    const state = await store.read();
    expect(state.records).toHaveLength(1);
    expect(state.records[0].status).toBe("SHADOW_ACCEPTED");
  });

  it("submits at most once for the same strategy signal", async () => {
    const broker = new MockLiveBroker();
    const { service, store } = serviceWith(broker);
    await arm(service);

    await service.processSnapshot(snapshot(), release());
    await service.processSnapshot(snapshot(), release());

    expect(broker.placeCalls).toBe(1);
    const state = await store.read();
    expect(state.records).toHaveLength(1);
    expect(state.records[0].status).toBe("LIVE_ACCEPTED");
    expect(state.controls.liveArm?.remainingOrders).toBe(0);
  });

  it("never automatically retries an uncertain live submission", async () => {
    const broker = new MockLiveBroker();
    broker.throwOnPlace = true;
    const { service, store } = serviceWith(broker);
    await arm(service);

    await service.processSnapshot(snapshot(), release());
    await service.processSnapshot(snapshot(), release());

    expect(broker.placeCalls).toBe(1);
    let state = await store.read();
    expect(state.records[0].status).toBe(
      "RECONCILIATION_REQUIRED"
    );

    broker.throwOnPlace = false;
    expect(await service.reconcileUnresolved()).toBe(1);
    state = await store.read();
    expect(state.records[0].status).toBe("RECONCILED");
  });

  it("blocks every new live order while a prior submit is unresolved", async () => {
    const broker = new MockLiveBroker();
    broker.throwOnPlace = true;
    const { service, store } = serviceWith(broker);
    await arm(service);

    await service.processSnapshot(snapshot(candidate(0.2, "signal-1")), release());

    broker.throwOnPlace = false;
    await service.armLive({
      approvedBy: "tester",
      reason: "second controlled approval",
      durationMinutes: 1,
      maxOrders: 1,
    });
    await service.processSnapshot(snapshot(candidate(0.2, "signal-2")), release());

    expect(broker.placeCalls).toBe(1);
    const state = await store.read();
    expect(state.records).toHaveLength(2);
    expect(state.records[0].status).toBe("RECONCILIATION_REQUIRED");
    expect(state.records[1].status).toBe("LIVE_PREFLIGHT_REJECTED");
    expect(state.records[1].message).toMatch(/requires reconciliation/i);
  });

  it("rejects risk above the independent live hard limit", async () => {
    const broker = new MockLiveBroker();
    const { service, store } = serviceWith(broker);
    await arm(service);

    await service.processSnapshot(snapshot(candidate(0.5)), release());

    expect(broker.placeCalls).toBe(0);
    const state = await store.read();
    expect(state.records[0].status).toBe(
      "LIVE_PREFLIGHT_REJECTED"
    );
    expect(state.records[0].message).toMatch(/risk percent/i);
  });

  it("cannot arm live execution while the persistent kill-switch is engaged", async () => {
    const broker = new MockLiveBroker();
    const { service } = serviceWith(broker);

    await expect(
      service.armLive({
        approvedBy: "tester",
        reason: "must not bypass kill-switch",
        durationMinutes: 1,
        maxOrders: 1,
      })
    ).rejects.toThrow(/kill-switch must be disengaged/i);
  });

  it("engaging the kill-switch also revokes the live arm", async () => {
    const broker = new MockLiveBroker();
    const { service, store } = serviceWith(broker);
    await arm(service);

    await service.setKillSwitch({
      engaged: true,
      changedBy: "tester",
      reason: "emergency stop",
    });

    const state = await store.read();
    expect(state.controls.killSwitchEngaged).toBe(true);
    expect(state.controls.liveArm).toBeNull();
  });
});
