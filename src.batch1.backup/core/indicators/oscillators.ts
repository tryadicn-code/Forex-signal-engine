import type { OHLCV } from "@/types/market";
import { closes } from "./series";
import { ema } from "./moving-averages";

/**
 * Relative Strength Index (Wilder smoothing).
 *
 * Index-aligned with the candles. Indices before `period` are filled with 50
 * (the neutral midpoint) so downstream code never sees NaN.
 */
export function rsi(candles: OHLCV[], period = 14): number[] {
  const px = closes(candles);
  const n = px.length;
  const out: number[] = new Array<number>(n).fill(50);
  if (n <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = px[i] - px[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  out[period] = rsValue(avgGain, avgLoss);
  for (let i = period + 1; i < n; i++) {
    const change = px[i] - px[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsValue(avgGain, avgLoss);
  }
  return out;
}

function rsValue(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

/**
 * MACD. The signal line is an EMA of the MACD line, seeded the same way as
 * {@link ema}, so the histogram is finite everywhere.
 */
export function macd(
  values: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MacdResult {
  const macdLine = ema(values, fastPeriod).map((v, i) => v - ema(values, slowPeriod)[i]);
  const signalLine = ema(macdLine, signalPeriod);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}
