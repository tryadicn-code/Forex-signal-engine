import type { OHLCV } from "@/types/market";

/** Extract the close series from candles. */
export function closes(candles: OHLCV[]): number[] {
  return candles.map((c) => c.close);
}

/** Extract the high series from candles. */
export function highs(candles: OHLCV[]): number[] {
  return candles.map((c) => c.high);
}

/** Extract the low series from candles. */
export function lows(candles: OHLCV[]): number[] {
  return candles.map((c) => c.low);
}

/** The last element of an array, or `undefined` when empty. */
export function last<T>(values: readonly T[]): T | undefined {
  return values.length === 0 ? undefined : values[values.length - 1];
}

/** Arithmetic mean. Returns 0 for an empty input. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Population standard deviation. */
export function stdDev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let sumSq = 0;
  for (const v of values) sumSq += (v - m) * (v - m);
  return Math.sqrt(sumSq / values.length);
}

/** Absolute price distance expressed in pips. */
export function pipsBetween(a: number, b: number, pipSize: number): number {
  if (pipSize <= 0) return 0;
  return Math.abs(a - b) / pipSize;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Timestamp for an engine result envelope.
 *
 * Accepts the market time (the snapshot asOf value) so a historical replay or
 * backtest reproduces identical timestamps. When no market time is supplied the
 * current wall clock is used, which is only valid for live operation.
 */
let deterministicMode = false;

/**
 * Enable deterministic mode: any engineTimestamp() call without marketAsOf
 * throws instead of silently using the wall clock, which would break replay
 * reproducibility.
 */
export function setDeterministicMode(enabled: boolean): void {
  deterministicMode = enabled;
}

export function isDeterministicMode(): boolean {
  return deterministicMode;
}

export function engineTimestamp(marketAsOf?: number): string {
  if (marketAsOf === undefined) {
    if (deterministicMode) {
      throw new Error(
        "engineTimestamp() called without marketAsOf in deterministic mode."
      );
    }
    return new Date().toISOString();
  }
  if (!Number.isFinite(marketAsOf)) {
    throw new Error("engineTimestamp() marketAsOf must be finite.");
  }
  return new Date(marketAsOf).toISOString();
}

/**
 * Deterministic seeded PRNG (mulberry32).
 *
 * Used only by test fixtures to build reproducible candle series. Never imported
 * by engine code - engines must be deterministic given identical input.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
