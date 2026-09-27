import { describe, it, expect } from "vitest";
import { filterClosedCandles, newestIsClosed } from "@/market-data/closed-candle";
import { candleCloseTime, intervalMs, alignToClosedCandle, closedBarsBefore } from "@/market-data/timeframe";
import type { CanonicalCandle } from "@/types/market-data";
import { normalizeCandles, type RawCandle } from "@/market-data/normalize";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);
const BAR = intervalMs("M15");

function candle(timestamp: number, overrides: Partial<CanonicalCandle> = {}): CanonicalCandle {
  return {
    symbol: "EURUSD",
    timeframe: "M15",
    timestamp,
    open: 1.08,
    high: 1.081,
    low: 1.079,
    close: 1.0805,
    volume: 1000,
    source: "mock",
    closed: false,
    ...overrides,
  };
}

describe("closed-candle safety", () => {
  it("keeps candles whose interval fully elapsed at the analysis time", () => {
    const candles = [candle(T0 - 3 * BAR), candle(T0 - 2 * BAR), candle(T0 - BAR)];
    const result = filterClosedCandles(candles, "M15", T0);
    expect(result.candles.length).toBe(3);
    expect(result.droppedOpen).toBe(0);
    expect(result.droppedFuture).toBe(0);
  });

  it("drops the in-progress candle that opened before T but has not closed", () => {
    const inProgress = T0 - BAR + 60_000; // opened 1m ago, closes in 14m
    const candles = [candle(T0 - 2 * BAR), candle(inProgress)];
    const result = filterClosedCandles(candles, "M15", T0);
    expect(result.candles.length).toBe(1);
    expect(result.droppedOpen).toBe(1);
    expect(result.candles.every((c) => c.timestamp !== inProgress)).toBe(true);
  });

  it("drops future candles that open after the analysis time (no look-ahead)", () => {
    const future = T0 + 2 * BAR;
    const candles = [candle(T0 - BAR), candle(future)];
    const result = filterClosedCandles(candles, "M15", T0);
    expect(result.candles.length).toBe(1);
    expect(result.droppedFuture).toBe(1);
    expect(result.candles.every((c) => c.timestamp !== future)).toBe(true);
  });

  it("treats a candle closed exactly at the close boundary as closed", () => {
    // candle(t).closeTime = t + interval; closeTime <= asOf means closed.
    const exactlyClosed = T0 - BAR;
    expect(candleCloseTime("M15", exactlyClosed)).toBe(T0);
    const result = filterClosedCandles([candle(exactlyClosed)], "M15", T0);
    expect(result.candles.length).toBe(1);
  });

  it("normalization marks only elapsed bars as closed", () => {
    const raw: RawCandle[] = [
      { timestamp: T0 - 2 * BAR, open: 1, high: 2, low: 0.5, close: 1.5 },
      { timestamp: T0 - BAR, open: 1, high: 2, low: 0.5, close: 1.5 },
      { timestamp: T0, open: 1, high: 2, low: 0.5, close: 1.5 }, // still forming
    ];
    const normalized = normalizeCandles(raw, {
      symbol: "EURUSD",
      timeframe: "M15",
      source: "mock",
      asOf: T0,
    });
    expect(normalized.map((c) => c.closed)).toEqual([true, true, false]);
  });

  it("newestIsClosed is false for an in-progress last bar", () => {
    expect(newestIsClosed([candle(T0 - BAR), candle(T0)], "M15", T0)).toBe(false);
    expect(newestIsClosed([candle(T0 - BAR)], "M15", T0)).toBe(true);
    expect(newestIsClosed([], "M15", T0)).toBe(false);
  });
});

describe("timeframe helpers", () => {
  it("aligns the analysis time down to the most recent closed candle", () => {
    const aligned = alignToClosedCandle("M15", T0);
    expect(aligned).toBeLessThan(T0);
    expect(candleCloseTime("M15", aligned)).toBeLessThanOrEqual(T0);
    // The aligned open is itself a closed bar boundary.
    expect(aligned % BAR).toBe(0);
  });

  it("counts closed bars between two market times", () => {
    expect(closedBarsBefore("M15", T0 - BAR, T0)).toBe(1);
    expect(closedBarsBefore("M15", T0 - 5 * BAR, T0)).toBe(5);
    expect(closedBarsBefore("M15", T0, T0)).toBe(0);
    expect(closedBarsBefore("M15", T0 + BAR, T0)).toBe(0);
  });

  it("respects timeframe intervals for higher timeframes", () => {
    const day = intervalMs("D1");
    expect(day).toBe(24 * 60 * 60 * 1000);
    expect(closedBarsBefore("D1", T0 - 2 * day, T0)).toBe(2);
  });
});
