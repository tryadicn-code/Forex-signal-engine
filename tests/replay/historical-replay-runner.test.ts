import { describe, expect, it } from "vitest";
import { HistoricalReplayRunner } from "@/replay/historical-replay-runner";
import type { ReplayDataset } from "@/replay/types";
import { intervalMs } from "@/market-data/timeframe";
import type { Timeframe } from "@/types/market";
import type { CanonicalCandle } from "@/types/market-data";

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
      source: "runner-test",
      closed: true,
    });
  }
  return values;
}

function dataset(): ReplayDataset {
  return {
    id: "runner-foundation",
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
          M15: [
            ...series("M15", 60, T0),
            ...series("M15", 2, T0 + 2 * intervalMs("M15")),
          ].sort((a, b) => a.timestamp - b.timestamp),
        },
      },
    },
  };
}

describe("HistoricalReplayRunner", () => {
  it("replays the existing scanner on deterministic market-time steps", async () => {
    const runner = new HistoricalReplayRunner(dataset(), {
      startAt: T0,
      endAt: T0 + 2 * intervalMs("M15"),
      symbols: ["EURUSD"],
    });

    const seen: number[] = [];
    const result = await runner.run({
      onStep: (step) => {
        seen.push(step.asOf);
      },
    });

    expect(result.stepCount).toBe(3);
    expect(result.firstStepAt).toBe(T0);
    expect(result.lastStepAt).toBe(T0 + 2 * intervalMs("M15"));
    expect(seen).toEqual([
      T0,
      T0 + intervalMs("M15"),
      T0 + 2 * intervalMs("M15"),
    ]);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].snapshot.symbolsRequested).toBe(1);
  });

  it("enables the Phase 5.2 execution layer only when requested", async () => {
    const withoutExecution = new HistoricalReplayRunner(dataset(), {
      startAt: T0,
      endAt: T0,
    });
    const withExecution = new HistoricalReplayRunner(dataset(), {
      startAt: T0,
      endAt: T0,
      execution: { enabled: true },
    });

    const baseline = await withoutExecution.run();
    const enabled = await withExecution.run();

    expect(baseline.execution).toBeNull();
    expect(baseline.analytics).toBeNull();
    expect(enabled.execution?.enabled).toBe(true);
    expect(enabled.execution?.initialBalance).toBe(10_000);
    expect(enabled.execution?.executionTimeframe).toBe("M15");
    expect(enabled.analytics).not.toBeNull();
    expect(enabled.analytics?.sampleSize).toBe(enabled.execution?.closedTradeCount);
  });

  it("keeps repositories isolated between replay runs", async () => {
    const first = new HistoricalReplayRunner(dataset(), {
      startAt: T0,
      endAt: T0,
    });
    const second = new HistoricalReplayRunner(dataset(), {
      startAt: T0,
      endAt: T0,
    });

    await first.run();

    expect(first.scanner.getLatestSnapshot()).not.toBeNull();
    expect(second.scanner.getLatestSnapshot()).toBeNull();
  });

  it("can stream steps without retaining every snapshot in memory", async () => {
    const runner = new HistoricalReplayRunner(dataset(), {
      startAt: T0,
      endAt: T0 + intervalMs("M15"),
    });
    let callbacks = 0;

    const result = await runner.run({
      collectSteps: false,
      onStep: () => {
        callbacks += 1;
      },
    });

    expect(result.stepCount).toBe(2);
    expect(result.steps).toEqual([]);
    expect(callbacks).toBe(2);
  });
});
