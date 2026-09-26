import { mean } from "./series";

/**
 * Simple moving average, index-aligned with the input.
 *
 * Early indices (before `period` values exist) use a partial mean of whatever is
 * available, so the result is always the same length as the input and never NaN.
 */
export function sma(values: readonly number[], period: number): number[] {
  if (period <= 0) return values.map(() => 0);
  const out: number[] = [];
  let running = 0;
  for (let i = 0; i < values.length; i++) {
    running += values[i];
    if (i >= period) running -= values[i - period];
    const count = Math.min(i + 1, period);
    out.push(running / count);
  }
  return out;
}

/**
 * Exponential moving average, index-aligned with the input.
 *
 * Seeded with the SMA of the first `period` values (the standard EMA-EMAFILTER
 * convention). Indices before the seed use a partial SMA, guaranteeing a
 * finite, deterministic value at every position.
 */
export function ema(values: readonly number[], period: number): number[] {
  const n = values.length;
  if (n === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array<number>(n);
  let prev = values[0];
  for (let i = 0; i < n; i++) {
    if (i < period - 1) {
      const seedSlice = values.slice(0, i + 1);
      const partial = mean(seedSlice);
      out[i] = partial;
      prev = partial;
    } else if (i === period - 1) {
      const seed = mean(values.slice(0, period));
      out[i] = seed;
      prev = seed;
    } else {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}
