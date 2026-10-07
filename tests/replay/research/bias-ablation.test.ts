import { describe, expect, it } from "vitest";
import type { ReplayDataset } from "@/replay/types";
import type { CanonicalCandle } from "@/types/market-data";
import type { Timeframe } from "@/types/market";
import { intervalMs } from "@/market-data/timeframe";
import {
  DEFAULT_ABLATIONS,
  runBiasAblationStudy,
} from "@/replay/research/bias-ablation";

const T0 = Date.UTC(2026, 0, 10, 0, 0, 0);

function series(
  timeframe: Timeframe,
  count: number,
  closedThrough: number
): CanonicalCandle[] {
  const step = intervalMs(timeframe);
  const values: CanonicalCandle[] = [];
  const firstOpen = closedThrough - count * step;
  for (let index = 0; index < count; index += 1) {
    const timestamp = firstOpen + index * step;
    const price = 1.08 + index * 0.0002;
    values.push({
      symbol: "EURUSD",
      timeframe,
      timestamp,
      open: price,
      high: price + 0.0004,
      low: price - 0.0003,
      close: price + 0.0001,
      volume: 100 + index,
      source: "bias-ablation-test",
      closed: true,
    });
  }
  return values;
}

function dataset(): ReplayDataset {
  return {
    id: "bias-ablation-smoke",
    source: "synthetic closed candles",
    symbols: {
      EURUSD: {
        metadata: {
          symbol: "EURUSD",
          baseCurrency: "EUR",
          quoteCurrency: "USD",
          pipSize: 0.0001,
          pricePrecision: 5,
          contractSize: 100_000,
          minLot: 0.01,
          maxLot: 100,
          lotStep: 0.01,
        },
        spreadPips: 1,
        candles: {
          D1: series("D1", 60, T0),
          H4: series("H4", 60, T0),
          H1: series("H1", 60, T0),
          M15: series("M15", 60, T0),
        },
      },
    },
  };
}

describe("bias-ablation research harness", () => {
  it("runs baseline plus four ablations and reports effect sizes", async () => {
    const result = await runBiasAblationStudy({
      dataset: dataset(),
      startAt: T0 - 20 * intervalMs("M15"),
      endAt: T0,
      symbols: ["EURUSD"],
    });

    expect(result.runs).toHaveLength(5);
    expect(result.runs[0].id).toBe("baseline");
    expect(result.runs.map((r) => r.id)).toEqual([
      "baseline",
      "ablate-structure",
      "ablate-trend",
      "ablate-regime",
      "ablate-momentum",
    ]);

    expect(result.effects).toHaveLength(4);
    for (const effect of result.effects) {
      expect(effect.sigma).toBeDefined();
      expect(typeof effect.informative).toBe("boolean");
    }

    expect(result.strategyConsistency).toHaveLength(4);
    expect(result.pairedOpportunities).toHaveLength(4);

    // Boundary sanity
    const span = T0 - (T0 - 20 * intervalMs("M15"));
    expect(result.isOosBoundary).toBe(Math.floor(T0 - 20 * intervalMs("M15") + span * 0.7));
  });

  it("honours a custom split ratio", async () => {
    const startAt = T0 - 20 * intervalMs("M15");
    const result = await runBiasAblationStudy({
      dataset: dataset(),
      startAt,
      endAt: T0,
      symbols: ["EURUSD"],
      isOosSplitRatio: 0.5,
    });
    const span = T0 - startAt;
    expect(result.isOosBoundary).toBe(Math.floor(startAt + span * 0.5));
  });

  it("rejects an invalid split ratio", async () => {
    await expect(
      runBiasAblationStudy({
        dataset: dataset(),
        startAt: T0 - 20 * intervalMs("M15"),
        endAt: T0,
        symbols: ["EURUSD"],
        isOosSplitRatio: 1.5,
      })
    ).rejects.toThrow(/isOosSplitRatio/);
  });

  it("produces identical results on repeat calls (determinism)", async () => {
    const args = {
      dataset: dataset(),
      startAt: T0 - 20 * intervalMs("M15"),
      endAt: T0,
      symbols: ["EURUSD"],
    };
    const first = await runBiasAblationStudy(args);
    const second = await runBiasAblationStudy(args);
    expect(second.isOosBoundary).toBe(first.isOosBoundary);
    expect(second.runs.map((r) => r.id)).toEqual(first.runs.map((r) => r.id));
    expect(second.effects.map((e) => e.ablatedComponent)).toEqual(
      first.effects.map((e) => e.ablatedComponent)
    );
  });

  it("exposes the default ablation spec set", () => {
    expect(DEFAULT_ABLATIONS).toHaveLength(5);
    const ids = DEFAULT_ABLATIONS.map((a) => a.id);
    expect(ids).toContain("baseline");
    expect(ids).toContain("ablate-regime");
  });
});