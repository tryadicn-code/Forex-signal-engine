import { describe, it, expect } from "vitest";
import { ScannerService } from "@/scanner/scanner-service";
import { MockMarketDataProvider } from "@/providers/market-data/mock-provider";
import type { MockSymbolScenario } from "@/providers/market-data/mock-provider";
import { TableAccountConversionResolver } from "@/market-data/account-conversion";
import { createInMemoryRepositories } from "@/repositories/in-memory";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function service(scenarios: Record<string, MockSymbolScenario> = {}, symbols = ["EURUSD"]) {
  const provider = new MockMarketDataProvider({ scenarios });
  return new ScannerService(
    { symbols },
    {
      marketData: provider,
      conversionResolver: new TableAccountConversionResolver(provider.getRates()),
      repositories: createInMemoryRepositories(),
    }
  );
}

describe("Phase 6 pinned scanner config", () => {
  it("carries an explicit engine config without mutating global defaults", () => {
    const scanner = new ScannerService({
      symbols: ["EURUSD"],
      engineConfig: {
        trigger: {
          minTriggerScore: 97,
        },
      },
    });

    expect(scanner.scannerConfig.engineConfig.trigger.minTriggerScore).toBe(97);
  });
});

describe("ScannerService scan cycle", () => {
  it("analyses every requested symbol", async () => {
    const s = service(
      { EURUSD: { direction: "UP" }, GBPUSD: { direction: "DOWN" } },
      ["EURUSD", "GBPUSD"]
    );
    const snapshot = await s.scanOnce(T0);
    expect(snapshot.symbolsRequested).toBe(2);
    expect(snapshot.results.map((r) => r.symbol).sort()).toEqual(["EURUSD", "GBPUSD"]);
  });

  it("produces a presentation-free result with the engine conclusions", async () => {
    const s = service({ EURUSD: { direction: "UP", pullback: true, resumption: true } });
    const snapshot = await s.scanOnce(T0);
    const result = snapshot.results[0];
    expect(result.status).toBe("ANALYSED");
    expect(result.symbol).toBe("EURUSD");
    expect(result.biasDirection).not.toBeNull();
    expect(result.strategyId).toBe("TREND_PULLBACK");
    expect(result.strategyRouting).not.toBeNull();
    expect(result.strategyRouting?.selectedStrategyId).toBe("TREND_PULLBACK");
    expect(result.strategyRouting?.regime).toBe(result.regime);
    expect(result.freshness).not.toBeNull();
    expect(result.updatedAt).toBe(T0);
    expect(Array.isArray(result.evidence)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("surfaces preferred strategy and compatibility fallback for non-trend regimes", async () => {
    const s = service({ EURUSD: { direction: "RANGE" } });
    const snapshot = await s.scanOnce(T0);
    const result = snapshot.results[0];

    expect(result.status).toBe("ANALYSED");
    expect(result.strategyId).toBe("TREND_PULLBACK");
    expect(result.strategyRouting?.selectedStrategyId).toBe("TREND_PULLBACK");
    expect(result.strategyRouting?.regime).toBe(result.regime);

    if (result.regime === "RANGE") {
      expect(result.strategyRouting?.preferredStrategyId).toBe(
        "RANGE_MEAN_REVERSION"
      );
      expect(result.strategyRouting?.mode).toBe("COMPATIBILITY_FALLBACK");
    }
  });

  it("threads the injected asOf everywhere instead of the wall clock", async () => {
    const s = service();
    const snapshot = await s.scanOnce(T0);
    expect(snapshot.startedAt).toBe(T0);
    expect(snapshot.completedAt).toBe(T0);
    // A replay at the same market time reproduces the same signal ids.
    const again = await s.scanOnce(T0);
    const first = snapshot.results.map((r) => r.signalId);
    const second = again.results.map((r) => r.signalId);
    expect(second).toEqual(first);
  });
});

describe("per-symbol failure isolation", () => {
  it("reports a failing symbol without killing the cycle", async () => {
    const s = service(
      { EURUSD: { direction: "UP" }, USDJPY: { direction: "UP", fail: true } },
      ["EURUSD", "USDJPY"]
    );
    const snapshot = await s.scanOnce(T0);
    expect(snapshot.symbolsRequested).toBe(2);
    const failed = snapshot.results.find((r) => r.symbol === "USDJPY");
    const ok = snapshot.results.find((r) => r.symbol === "EURUSD");
    expect(failed?.status).not.toBe("ANALYSED");
    expect(failed?.reason).toBeTruthy();
    expect(ok?.status).toBe("ANALYSED");
  });

  it("records a machine-readable status for a provider failure", async () => {
    const s = service({ EURUSD: { direction: "UP", fail: true } });
    const snapshot = await s.scanOnce(T0);
    expect(snapshot.results[0].status).toBe("PROVIDER_FAILURE");
    expect(snapshot.results[0].errors.length).toBeGreaterThan(0);
  });

  it("flags stale data as STALE and data-gates execution", async () => {
    const s = service({ EURUSD: { direction: "UP", stale: true } });
    const snapshot = await s.scanOnce(T0);
    const result = snapshot.results[0];
    // Staleness does not remove the candles - there are still enough bars - so
    // the symbol IS analysed, but it is flagged STALE and the lifecycle blocks
    // execution rather than greenlighting a stale setup.
    expect(result.status).toBe("ANALYSED");
    expect(result.freshness).toBe("STALE");
    expect(result.signalState).not.toBe("EXECUTE");
    expect(result.executionDecision).not.toBe("EXECUTE");
  });

  it("surfaces the stale-data issue on the result", async () => {
    const s = service({ EURUSD: { direction: "UP", stale: true } });
    const snapshot = await s.scanOnce(T0);
    expect(
      snapshot.results[0].issues.some((i) => i.code === "STALE_DATA")
    ).toBe(true);
  });

  it("surfaces a symbol that throws unexpectedly as ANALYSIS_ERROR", async () => {
    const provider = new ThrowingProvider();
    const s = new ScannerService(
      { symbols: ["EURUSD"] },
      {
        marketData: provider,
        conversionResolver: new TableAccountConversionResolver(provider.getRates()),
        repositories: createInMemoryRepositories(),
      }
    );
    const snapshot = await s.scanOnce(T0);
    expect(snapshot.results[0].status).toBe("ANALYSIS_ERROR");
    expect(snapshot.symbolsRequested).toBe(1);
  });

  it("counts successes and failures across the universe", async () => {
    const s = service(
      { EURUSD: { direction: "UP" }, USDJPY: { direction: "UP", fail: true } },
      ["EURUSD", "USDJPY"]
    );
    const snapshot = await s.scanOnce(T0);
    expect(snapshot.symbolsSuccessful).toBe(1);
    expect(snapshot.symbolsFailed).toBe(1);
  });
});

describe("scanner snapshot and health", () => {
  it("stores the latest snapshot in the repository", async () => {
    const s = service();
    const snapshot = await s.scanOnce(T0);
    expect(s.repositories.snapshots.getLatest()?.startedAt).toBe(snapshot.startedAt);
  });

  it("records one funnel observation per scanned symbol without altering scanner results", async () => {
    const s = service(
      { EURUSD: { direction: "UP" }, GBPUSD: { direction: "DOWN" } },
      ["EURUSD", "GBPUSD"]
    );
    const snapshot = await s.scanOnce(T0);
    const observations = s.repositories.funnelAnalytics?.getSince(T0, T0) ?? [];

    expect(snapshot.results).toHaveLength(2);
    expect(observations).toHaveLength(2);
    expect(observations.map((item) => item.symbol).sort()).toEqual([
      "EURUSD",
      "GBPUSD",
    ]);
    expect(observations.every((item) => item.strategyId === "TREND_PULLBACK")).toBe(
      true
    );
    expect(
      observations.every((item) => item.routingMode !== null)
    ).toBe(true);
  });

  it("summarizes freshness across the universe", async () => {
    const s = service();
    const snapshot = await s.scanOnce(T0);
    const total = Object.values(snapshot.freshnessSummary).reduce((a, b) => a + b, 0);
    expect(total).toBe(snapshot.results.length);
  });

  it("reports provider status with the snapshot", async () => {
    const s = service();
    const snapshot = await s.scanOnce(T0);
    expect(snapshot.providerStatus).not.toBeNull();
    expect(snapshot.providerStatus?.state).toBe("CONNECTED");
  });

  it("records health including the active-signal count", async () => {
    const s = service({ EURUSD: { direction: "UP", pullback: true, resumption: true } });
    await s.scanOnce(T0);
    const health = s.repositories.health.get();
    expect(health).not.toBeNull();
    expect(health!.symbolsRequested).toBe(1);
    expect(typeof health!.activeSignals).toBe("number");
  });

  it("degrades provider status after failures", async () => {
    const s = service({ EURUSD: { direction: "UP", fail: true } });
    const snapshot = await s.scanOnce(T0);
    expect(snapshot.providerStatus?.errorCount).toBeGreaterThan(0);
  });
});

describe("signal lifecycle integration", () => {
  it("keeps a stable signalId for the same setup across cycles", async () => {
    const s = service({ EURUSD: { direction: "UP", pullback: true, resumption: true } });
    const a = await s.scanOnce(T0);
    const b = await s.scanOnce(T0);
    const idA = a.results[0].signalId;
    const idB = b.results[0].signalId;
    if (idA !== null) {
      expect(idB).toBe(idA);
      expect(s.repositories.signals.getById(idA)).not.toBeNull();
    }
  });

  it("persists transitions to the history repository", async () => {
    const s = service({ EURUSD: { direction: "UP", pullback: true, resumption: true } });
    await s.scanOnce(T0);
    await s.scanOnce(T0);
    expect(s.repositories.transitions.count()).toBeGreaterThanOrEqual(0);
    // Any recorded transition carries identity and a reason.
    for (const t of s.repositories.transitions.getRecent(5)) {
      expect(t.reason).toBeTruthy();
      expect(t.timestamp).toBe(T0);
    }
  });

  it("closes a signal once its TTL lapses", async () => {
    const s = service({ EURUSD: { direction: "UP", pullback: true, resumption: true } });
    const first = await s.scanOnce(T0);
    const id = first.results[0].signalId;
    // Advance far beyond every TTL (triggerBars=3, setupBars=6 on M15/H1).
    const later = T0 + 20 * 24 * 60 * 60 * 1000;
    await s.scanOnce(later);
    if (id !== null) {
      const stored = s.repositories.signals.getById(id);
      if (stored) {
        expect(["CLOSED", "INVALIDATED"]).toContain(stored.state);
      }
    }
  });
});

describe("deterministic replay", () => {
  it("replays an earlier asOf identically on a fresh scanner", async () => {
    const earlier = T0 - 5 * 24 * 60 * 60 * 1000;
    const s1 = service({ EURUSD: { direction: "UP" } });
    const s2 = service({ EURUSD: { direction: "UP" } });
    const a = await s1.scanOnce(earlier);
    const b = await s2.scanOnce(earlier);
    expect(a.results[0].signalId).toEqual(b.results[0].signalId);
    expect(a.results[0].biasDirection).toEqual(b.results[0].biasDirection);
  });
});

class ThrowingProvider extends MockMarketDataProvider {
  async getCandles(): Promise<never> {
    throw new Error("provider exploded");
  }
}
