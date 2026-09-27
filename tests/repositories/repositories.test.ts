import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemorySignalRepository,
  InMemoryTransitionHistoryRepository,
  InMemorySnapshotRepository,
  InMemoryHealthRepository,
  createInMemoryRepositories,
} from "@/repositories/in-memory";
import { computeSignalIdentity, createLifecycle } from "@/scanner/signal-lifecycle";
import type { SignalStateTransition } from "@/types/market-data";
import type { ScannerSnapshot } from "@/scanner/scanner-result";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function identity(symbol = "EURUSD", originTimestamp = T0) {
  return computeSignalIdentity({
    symbol,
    direction: "LONG",
    originTimeframe: "H1",
    originTimestamp,
    zoneLow: 1.082,
    zoneHigh: 1.086,
    pipSize: 0.0001,
  });
}

describe("InMemorySignalRepository", () => {
  let repo: InMemorySignalRepository;

  beforeEach(() => {
    repo = new InMemorySignalRepository();
  });

  it("returns null for an unknown id", () => {
    expect(repo.getById("missing")).toBeNull();
  });

  it("stores and retrieves a lifecycle by id", () => {
    const lifecycle = createLifecycle(identity(), T0);
    repo.upsert(lifecycle);
    const stored = repo.getById(lifecycle.identity.signalId);
    expect(stored).not.toBeNull();
    expect(stored!.identity.symbol).toBe("EURUSD");
  });

  it("replaces an existing lifecycle on upsert (same id, refreshed state)", () => {
    const lifecycle = createLifecycle(identity(), T0);
    repo.upsert(lifecycle);
    const updated = { ...lifecycle, state: "WATCH" as const, updatedAt: T0 + 1 };
    repo.upsert(updated);
    expect(repo.count()).toBe(1);
    expect(repo.getById(lifecycle.identity.signalId)?.state).toBe("WATCH");
  });

  it("groups lifecycles by symbol", () => {
    repo.upsert(createLifecycle(identity("EURUSD", T0), T0));
    repo.upsert(createLifecycle(identity("GBPUSD", T0), T0));
    repo.upsert(createLifecycle(identity("EURUSD", T0 + 60_000), T0 + 60_000));
    expect(repo.getBySymbol("EURUSD").length).toBe(2);
    expect(repo.getBySymbol("GBPUSD").length).toBe(1);
  });

  it("returns all lifecycles newest-first", () => {
    // Distinct origin -> distinct id; the second is also created later, so it
    // sorts first under the newest-first ordering.
    repo.upsert(createLifecycle(identity("EURUSD", T0), T0));
    repo.upsert(createLifecycle(identity("EURUSD", T0 + 60_000), T0 + 60_000));
    const all = repo.getAll();
    expect(all.length).toBe(2);
    expect(all[0].updatedAt).toBeGreaterThanOrEqual(all[1].updatedAt);
  });

  it("deletes a lifecycle and reports whether it existed", () => {
    const lifecycle = createLifecycle(identity(), T0);
    expect(repo.delete(lifecycle.identity.signalId)).toBe(false);
    repo.upsert(lifecycle);
    expect(repo.delete(lifecycle.identity.signalId)).toBe(true);
    expect(repo.count()).toBe(0);
  });

  it("clears every record", () => {
    repo.upsert(createLifecycle(identity(), T0));
    repo.clear();
    expect(repo.count()).toBe(0);
  });
});

describe("InMemoryTransitionHistoryRepository", () => {
  let repo: InMemoryTransitionHistoryRepository;

  beforeEach(() => {
    repo = new InMemoryTransitionHistoryRepository();
  });

  function transition(order: number): SignalStateTransition {
    return {
      signalId: "S1",
      symbol: "EURUSD",
      previousState: order === 0 ? null : "WATCH",
      newState: order === 0 ? "WATCH" : "SETUP",
      timestamp: T0 + order * 60_000,
      reason: `step ${order}`,
    };
  }

  it("appends and reads history oldest-first for a signal", () => {
    repo.append(transition(0));
    repo.append(transition(1));
    const history = repo.getBySignal("S1");
    expect(history.length).toBe(2);
    expect(history[0].reason).toBe("step 0");
    expect(history[1].reason).toBe("step 1");
  });

  it("returns recent transitions newest-first", () => {
    repo.append(transition(0));
    repo.append(transition(1));
    repo.append(transition(2));
    const recent = repo.getRecent(2);
    expect(recent.length).toBe(2);
    expect(recent[0].reason).toBe("step 2");
  });

  it("isolates history by signal id", () => {
    repo.append({ ...transition(0), signalId: "S1" });
    repo.append({ ...transition(0), signalId: "S2" });
    expect(repo.getBySignal("S1").length).toBe(1);
    expect(repo.getBySignal("S2").length).toBe(1);
  });

  it("counts and clears", () => {
    repo.append(transition(0));
    expect(repo.count()).toBe(1);
    repo.clear();
    expect(repo.count()).toBe(0);
  });
});

describe("InMemorySnapshotRepository", () => {
  it("returns null before the first scan", () => {
    const repo = new InMemorySnapshotRepository();
    expect(repo.getLatest()).toBeNull();
  });

  it("keeps only the most recent snapshot", () => {
    const repo = new InMemorySnapshotRepository();
    const first: ScannerSnapshot = {
      startedAt: T0,
      completedAt: T0,
      durationMs: null,
      symbolsRequested: 1,
      symbolsSuccessful: 1,
      symbolsFailed: 0,
      results: [],
      providerStatus: null,
      freshnessSummary: { FRESH: 1, DELAYED: 0, STALE: 0 },
    };
    const second = { ...first, startedAt: T0 + 60_000 };
    repo.save(first);
    repo.save(second);
    expect(repo.getLatest()?.startedAt).toBe(T0 + 60_000);
    repo.clear();
    expect(repo.getLatest()).toBeNull();
  });
});

describe("InMemoryHealthRepository", () => {
  it("starts empty and stores health plus provider status", () => {
    const repo = new InMemoryHealthRepository();
    expect(repo.get()).toBeNull();
    expect(repo.getProviderStatus()).toBeNull();
    repo.save({
      lastScanStartedAt: T0,
      lastScanCompletedAt: T0,
      durationMs: 5,
      symbolsRequested: 1,
      symbolsSuccessful: 1,
      symbolsFailed: 0,
      providerStatus: null,
      freshnessSummary: { FRESH: 1, DELAYED: 0, STALE: 0 },
      activeSignals: 0,
    });
    expect(repo.get()?.lastScanStartedAt).toBe(T0);
    repo.saveProviderStatus({
      state: "DEGRADED",
      lastSuccessAt: null,
      lastFailureAt: T0,
      errorCount: 1,
    });
    expect(repo.getProviderStatus()?.state).toBe("DEGRADED");
    repo.clear();
    expect(repo.get()).toBeNull();
    expect(repo.getProviderStatus()).toBeNull();
  });
});

describe("createInMemoryRepositories", () => {
  it("returns four independent repositories", () => {
    const bundle = createInMemoryRepositories();
    expect(bundle.signals).toBeInstanceOf(InMemorySignalRepository);
    expect(bundle.transitions).toBeInstanceOf(InMemoryTransitionHistoryRepository);
    expect(bundle.snapshots).toBeInstanceOf(InMemorySnapshotRepository);
    expect(bundle.health).toBeInstanceOf(InMemoryHealthRepository);
  });

  it("gives each call a fresh bundle (no shared state between callers)", () => {
    const a = createInMemoryRepositories();
    const b = createInMemoryRepositories();
    a.signals.upsert(createLifecycle(identity(), T0));
    expect(b.signals.count()).toBe(0);
  });
});
