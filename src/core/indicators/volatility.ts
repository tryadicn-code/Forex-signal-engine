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
  let prev = candles[0].high - candles[0].low;
  out[0] = prev;
  for (let i = 1; i < n; i++) {
    const tr = trueRange(candles, i);
    if (i < period) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += trueRange(candles, j);
      prev = sum / (i + 1);
    } else if (i === period) {
      let sum = 0;
      for (let j = 1; j <= period; j++) sum += trueRange(candles, j);
      prev = sum / period;
    } else {
      prev = (prev * (period - 1) + tr) / period;
    }
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
  return middle.map((m, i) => (m === 0 ? 0 : (upper[i] - lower[i]) / m));
}
