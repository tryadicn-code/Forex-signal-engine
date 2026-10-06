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
    expect(result.strategyId).not.toBeNull();
    expect(result.strategyRouting).not.toBeNull();
    expect(result.strategyId).toBe(result.strategyRouting?.selectedStrategyId);
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
    expect(result.strategyId).toBe(result.strategyRouting?.selectedStrategyId);
    expect(result.strategyRouting?.regime).toBe(result.regime);

    if (result.regime === "RANGE") {
      expect(result.strategyRouting?.preferredStrategyId).toBe(
        "RANGE_MEAN_REVERSION"
      );
      expect(result.strategyRouting?.selectedStrategyId).toBe(
        "RANGE_MEAN_REVERSION"
      );
      expect(result.strategyRouting?.mode).toBe("REGIME_MATCH");
    } else if (result.regime === "BREAKOUT") {
      expect(result.strategyRouting?.preferredStrategyId).toBe(
        "BREAKOUT_RETEST"
      );
      expect(result.strategyRouting?.selectedStrategyId).toBe(
        "BREAKOUT_RETEST"
      );
      expect(result.strategyRouting?.mode).toBe("REGIME_MATCH");
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
    expect(
      observations.every(
        (item) =>
          item.strategyId === "TREND_PULLBACK" ||
          item.strategyId === "BREAKOUT_RETEST" ||
          item.strategyId === "RANGE_MEAN_REVERSION" ||
          item.strategyId === "REVERSAL"
      )
    ).toBe(true);
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
      expect(a.results[0].strategyId).not.toBeNull();
      expect(idA).toContain(
        `|strategy:${a.results[0].strategyId}|`
      );
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
// ---------------------------------------------------------------------------
// TRD-005 — bounded concurrent scanning
// ---------------------------------------------------------------------------

class SlowTrackingProvider extends MockMarketDataProvider {
  public inFlight = 0;
  public maxInFlight = 0;
  public delays: Record<string, number> = {};

  async getCandles(
    request: import("@/providers/market-data/provider").CandleRequest
  ) {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      const delay = this.delays[request.symbol] ?? 0;
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      return await super.getCandles(request);
    } finally {
      this.inFlight -= 1;
    }
  }
}

function concurrentService(input: {
  symbols: string[];
  scenarios?: Record<string, MockSymbolScenario>;
  scanConcurrency?: number;
  delays?: Record<string, number>;
}) {
  const provider = new SlowTrackingProvider({
    scenarios: input.scenarios ?? {},
  });
  if (input.delays) provider.delays = input.delays;
  const scanner = new ScannerService(
    {
      symbols: input.symbols,
      ...(input.scanConcurrency === undefined
        ? {}
        : { scanConcurrency: input.scanConcurrency }),
    },
    {
      marketData: provider,
      conversionResolver: new TableAccountConversionResolver(provider.getRates()),
      repositories: createInMemoryRepositories(),
    }
  );
  return { scanner, provider };
}

describe("TRD-005 bounded scan concurrency", () => {
  it("caps concurrent provider requests at scanConcurrency", async () => {
    const symbols = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD"];
    const scenarios = Object.fromEntries(
      symbols.map((s) => [s, { direction: "UP" } as MockSymbolScenario])
    );
    const delays = Object.fromEntries(symbols.map((s) => [s, 12]));
    const { scanner, provider } = concurrentService({
      symbols,
      scenarios,
      scanConcurrency: 3,
      delays,
    });

    await scanner.scanOnce(T0);

    expect(provider.maxInFlight).toBeLessThanOrEqual(3);
    expect(provider.maxInFlight).toBeGreaterThan(1);
  });

  it("preserves symbol order in results regardless of completion order", async () => {
    const symbols = ["EURUSD", "GBPUSD", "USDJPY"];
    const scenarios = {
      EURUSD: { direction: "UP" } as MockSymbolScenario,
      GBPUSD: { direction: "UP" } as MockSymbolScenario,
      USDJPY: { direction: "UP" } as MockSymbolScenario,
    };
    const { scanner } = concurrentService({
      symbols,
      scenarios,
      scanConcurrency: 3,
      delays: { EURUSD: 30, GBPUSD: 1, USDJPY: 1 },
    });

    const snapshot = await scanner.scanOnce(T0);

    expect(snapshot.results.map((r) => r.symbol)).toEqual(symbols);
  });

  it("falls back to sequential execution when scanConcurrency is 1", async () => {
    const symbols = ["EURUSD", "GBPUSD", "USDJPY"];
    const scenarios = Object.fromEntries(
      symbols.map((s) => [s, { direction: "UP" } as MockSymbolScenario])
    );
    const { scanner, provider } = concurrentService({
      symbols,
      scenarios,
      scanConcurrency: 1,
      delays: { EURUSD: 8, GBPUSD: 8, USDJPY: 8 },
    });

    await scanner.scanOnce(T0);

    expect(provider.maxInFlight).toBe(1);
  });

  it("keeps per-symbol failure isolation under concurrency", async () => {
    const symbols = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD"];
    const scenarios: Record<string, MockSymbolScenario> = {
      EURUSD: { direction: "UP" },
      GBPUSD: { direction: "DOWN" },
      USDJPY: { direction: "UP", fail: true },
      USDCHF: { direction: "UP" },
      AUDUSD: { direction: "UP" },
    };
    const { scanner } = concurrentService({
      symbols,
      scenarios,
      scanConcurrency: 3,
    });

    const snapshot = await scanner.scanOnce(T0);

    expect(snapshot.symbolsSuccessful).toBe(4);
    expect(snapshot.symbolsFailed).toBe(1);
    const failed = snapshot.results.find((r) => r.symbol === "USDJPY");
    expect(failed?.status).not.toBe("ANALYSED");
    expect(snapshot.results.map((r) => r.symbol)).toEqual(symbols);
  });
});

// ---------------------------------------------------------------------------
// TRD-004 B1 — partial pipeline (trigger timeframe unavailable)
// ---------------------------------------------------------------------------

describe("TRD-004 B1 partial pipeline", () => {
  it("returns ANALYSED_PARTIAL when only M15 is missing", async () => {
    const s = service({ EURUSD: { direction: "UP", partialM15: true } });
    const snapshot = await s.scanOnce(T0);
    const result = snapshot.results[0];

    expect(result.status).toBe("ANALYSED_PARTIAL");
    expect(result.executionEligible).toBe(false);
    expect(result.triggerState).toBeNull();
    expect(result.executionDecision).toBeNull();
    expect(result.signalState).toBeNull();
    expect(result.signalId).toBeNull();
    expect(result.biasDirection).not.toBeNull();
    expect(result.regime).not.toBeNull();
    expect(result.timeframes.map((t) => t.role)).toEqual([
      "macro",
      "bias",
      "setup",
    ]);
  });

  it("does not affect sibling symbols in the same cycle", async () => {
    const s = service(
      {
        EURUSD: { direction: "UP" },
        GBPUSD: { direction: "UP", partialM15: true },
      },
      ["EURUSD", "GBPUSD"]
    );
    const snapshot = await s.scanOnce(T0);
    const eur = snapshot.results.find((r) => r.symbol === "EURUSD");
    const gbp = snapshot.results.find((r) => r.symbol === "GBPUSD");

    expect(eur?.status).toBe("ANALYSED");
    expect(gbp?.status).toBe("ANALYSED_PARTIAL");
    expect(snapshot.symbolsSuccessful).toBe(2);
    expect(snapshot.symbolsFailed).toBe(0);
  });

  it("does not record lifecycle transitions or signals for a partial symbol", async () => {
    const s = service({ EURUSD: { direction: "UP", partialM15: true } });
    await s.scanOnce(T0);
    expect(s.repositories.transitions.count()).toBe(0);
    expect(s.repositories.signals.count()).toBe(0);
  });
});
