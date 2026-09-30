import { describe, expect, it } from "vitest";
import { resolveNotificationConfig } from "@/config/notifications";
import { NotificationService } from "@/notifications/service";
import { TransactionalNotificationStore } from "@/notifications/store";
import type {
  NotificationAdapter,
  NotificationSendResult,
} from "@/notifications/types";
import { MemoryTransactionalStateStore } from "@/transactional/memory-store";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type {
  ScannerSnapshot,
  SymbolScanResult,
} from "@/scanner/scanner-result";

class RecordingAdapter implements NotificationAdapter {
  readonly channel = "telegram" as const;
  messages: string[] = [];
  failuresRemaining = 0;

  async send(message: string): Promise<NotificationSendResult> {
    this.messages.push(message);
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("temporary failure");
    }
    return { providerMessageId: "tg-1" };
  }
}

function config(cooldownSeconds = 300) {
  return resolveNotificationConfig({
    FSE_ALERTS_ENABLED: "true",
    FSE_TELEGRAM_ENABLED: "true",
    FSE_TELEGRAM_BOT_TOKEN: "123:abc",
    FSE_TELEGRAM_CHAT_ID: "456",
    FSE_ALERT_COOLDOWN_SECONDS: String(cooldownSeconds),
    FSE_ALERT_RETRY_BASE_MS: "1",
    FSE_ALERT_MAX_ATTEMPTS: "3",
  });
}

function release(): ReleaseRuntimeState {
  return {
    status: "ACTIVE",
    reason: "ACTIVE_RELEASE",
    canScan: true,
    version: "1.0.0",
    title: "test",
    manifestFingerprint: "fp",
    sourceReportId: "backtest",
    activationAt: 1000,
    registryUpdatedAt: 1000,
    resolvedAt: 2000,
    pinned: true,
    defaultDrift: false,
    driftAreas: [],
    message: "active",
  };
}

function row(signalId = "sig-1"): SymbolScanResult {
  return {
    symbol: "EURUSD",
    status: "ANALYSED",
    reason: "ok",
    latestPrice: 1.1,
    spreadPips: 1,
    regime: "TREND_UP",
    bias: "LONG",
    biasScore: 82,
    biasDirection: "LONG",
    setupState: "ARMED",
    setupScore: 88,
    triggerState: "WAITING",
    triggerScore: 78,
    triggerAgeInBars: 0,
    riskReward: 2.1,
    positionSize: 0.05,
    executionDecision: "WAIT",
    signalState: "ARMED",
    signalId,
    freshness: "FRESH",
    updatedAt: 2000,
    timeframes: [],
    executionDetail: {
      decision: "WAIT",
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
      takeProfit2: null,
      riskCapital: 20,
      riskPercent: 0.2,
      positionSize: 0.05,
      plannedRR: 2.1,
      pipSize: 0.0001,
      accountCurrency: "USD",
    },
    evidence: [],
    conflicts: [],
    issues: [],
    errors: [],
  };
}

function snapshot(
  signalId = "sig-1",
  completedAt = Date.now()
): ScannerSnapshot {
  return {
    startedAt: completedAt - 100,
    completedAt,
    durationMs: 100,
    symbolsRequested: 1,
    symbolsSuccessful: 1,
    symbolsFailed: 0,
    results: [row(signalId)],
    providerStatus: null,
    freshnessSummary: {
      FRESH: 1,
      DELAYED: 0,
      STALE: 0,
    },
  };
}

function harness(cooldownSeconds = 300) {
  const store = new TransactionalNotificationStore(
    new MemoryTransactionalStateStore()
  );
  const adapter = new RecordingAdapter();
  const service = new NotificationService(
    store,
    config(cooldownSeconds),
    new Map([["telegram", adapter]]),
    "Asia/Makassar"
  );
  return { service, store, adapter };
}

describe("Phase 11 notification service", () => {
  it("deduplicates the same signal + alert state", async () => {
    const { service, store } = harness(0);
    const now = Date.now();

    expect(await service.processSnapshot(snapshot("sig-1", now), release())).toBe(1);
    expect(await service.processSnapshot(snapshot("sig-1", now + 1000), release())).toBe(0);

    const state = await store.read();
    expect(state.events).toHaveLength(1);
    expect(state.deliveries).toHaveLength(1);
  });

  it("suppresses a new same-symbol alert within cooldown", async () => {
    const { service, store } = harness(300);
    const now = Date.now();

    await service.processSnapshot(snapshot("sig-1", now), release());
    await service.processSnapshot(snapshot("sig-2", now + 1000), release());

    const state = await store.read();
    expect(state.events).toHaveLength(2);
    expect(state.events[1].status).toBe("SUPPRESSED");
    expect(state.deliveries).toHaveLength(1);
  });

  it("delivers queued Telegram alert and persists provider id", async () => {
    const { service, store, adapter } = harness(0);
    await service.processSnapshot(snapshot(), release());
    expect(await service.drainDueDeliveries()).toBe(1);

    const state = await store.read();
    expect(adapter.messages).toHaveLength(1);
    expect(state.events[0].status).toBe("SENT");
    expect(state.deliveries[0].status).toBe("SENT");
    expect(state.deliveries[0].providerMessageId).toBe("tg-1");
  });

  it("retries a transient notification failure without duplicating the event", async () => {
    const { service, store, adapter } = harness(0);
    adapter.failuresRemaining = 1;
    await service.processSnapshot(snapshot(), release());

    expect(await service.drainDueDeliveries()).toBe(1);
    let state = await store.read();
    expect(state.events).toHaveLength(1);
    expect(state.deliveries[0].status).toBe("PENDING");
    expect(state.deliveries[0].attempts).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await service.drainDueDeliveries()).toBe(1);
    state = await store.read();
    expect(state.events[0].status).toBe("SENT");
    expect(state.deliveries[0].attempts).toBe(2);
  });
});
