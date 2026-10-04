import type { OHLCV } from "@/types/market";
import { sma } from "./moving-averages";
import { stdDev } from "./series";

/** True range for one candle, in price units. */
export function trueRange(candles: OHLCV[], index: number): number {
  const c = candles[index];
  if (index === 0) return c.high - c.low;
  const prevClose = candles[index - 1].close;
  return Math.max(
    c.high - c.low,
    Math.abs(c.high - prevClose),
    Math.abs(c.low - prevClose)
  );
}

/**
 * Average True Range (Wilder smoothing), index-aligned with the candles.
 *
 * Early indices use the running mean of available true ranges.
 */
export function atr(candles: OHLCV[], period = 14): number[] {
  const n = candles.length;
  if (n === 0) return [];
  const out: number[] = new Array<number>(n);
  if (n === 1) {
    out[0] = candles[0].high - candles[0].low;
    return out;
  }

  out[0] = trueRange(candles, 0);

  if (n <= period) {
    let sum = trueRange(candles, 0);
    for (let i = 1; i < n; i++) {
      sum += trueRange(candles, i);
      out[i] = sum / (i + 1);
    }
    return out;
  }

  let warmupSum = trueRange(candles, 0);
  for (let i = 1; i < period; i++) {
    warmupSum += trueRange(candles, i);
    out[i] = warmupSum / (i + 1);
  }

  let seedSum = 0;
  for (let j = 1; j <= period; j++) seedSum += trueRange(candles, j);
  let prev = seedSum / period;
  out[period] = prev;

  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + trueRange(candles, i)) / period;
    out[i] = prev;
  }
  return out;
}

export interface BollingerResult {
  middle: number[];
  upper: number[];
  lower: number[];
}

/** Bollinger Bands using a simple moving average midline. */
export function bollingerBands(
  values: readonly number[],
  period = 20,
  multiplier = 2
): BollingerResult {
  const middle = sma(values, period);
  const upper: number[] = new Array<number>(values.length);
  const lower: number[] = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const sd = stdDev(values.slice(start, i + 1));
    upper[i] = middle[i] + multiplier * sd;
    lower[i] = middle[i] - multiplier * sd;
  }
  return { middle, upper, lower };
}

/**
 * Bollinger Band Width: (upper - lower) / middle.
 *
 * A dimensionless squeeze/expansion measure that the Regime Engine compares
 * against its own lookback average. Guarded against a zero midline.
 */
export function bollingerBandWidth(
  values: readonly number[],
  period = 20,
  multiplier = 2
): number[] {
  const { middle, upper, lower } = bollingerBands(values, period, multiplier);
  return middle.map((m, i) =>
    Math.abs(m) < 1e-12 ? 0 : (upper[i] - lower[i]) / m
  );
}
