/**
 * Timeframe intervals and candle-close conventions.
 *
 * The whole pipeline uses UTC internally. A candle is identified by the UTC
 * epoch-millisecond timestamp of its OPEN, and it is only CLOSED once its full
 * interval has elapsed:
 *
 *   candle(t).closeTime = t + interval(timeframe)
 *
 * So at analysis time T, the candle open at t is closed iff t + interval <= T.
 * This is the foundation of both the closed-candle filter and the no-look-ahead
 * guarantee: an unfinished bar can never produce a "confirmed" BOS/CHOCH or
 * trigger, because the engines only ever receive bars already closed at T.
 */

import type { Timeframe } from "@/types/market";

/** One minute, in milliseconds. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Duration of one candle of each timeframe, in milliseconds. */
export const TIMEFRAME_INTERVAL_MS: Record<Timeframe, number> = {
  M1: MINUTE,
  M5: 5 * MINUTE,
  M15: 15 * MINUTE,
  M30: 30 * MINUTE,
  H1: HOUR,
  H4: 4 * HOUR,
  D1: DAY,
  W1: 7 * DAY,
  MN: 30 * DAY,
};

export function intervalMs(timeframe: Timeframe): number {
  return TIMEFRAME_INTERVAL_MS[timeframe];
}

/**
 * Wall-clock time at which the candle opened at `timestamp` becomes closed.
 * This is an exclusive boundary: at exactly the close time the candle IS closed.
 */
export function candleCloseTime(timeframe: Timeframe, timestamp: number): number {
  return timestamp + intervalMs(timeframe);
}

/** True when the candle opened at `timestamp` had fully closed by `asOf`. */
export function isCandleClosed(
  timeframe: Timeframe,
  timestamp: number,
  asOf: number
): boolean {
  return candleCloseTime(timeframe, timestamp) <= asOf;
}

/**
 * Number of whole, closed candles of `timeframe` that exist at or before `asOf`.
 * Used for bar-aware TTL: it counts bar boundaries, not wall-clock seconds.
 */
export function closedBarsBefore(
  timeframe: Timeframe,
  referenceTimestamp: number,
  asOf: number
): number {
  if (asOf <= referenceTimestamp) return 0;
  return Math.floor((asOf - referenceTimestamp) / intervalMs(timeframe));
}

/**
 * Align a candidate analysis time DOWN to the most recent closed candle of the
 * given timeframe. Any candle that would still be forming at `asOf` is dropped,
 * which prevents an unfinished higher-timeframe bar from leaking into analysis.
 */
export function alignToClosedCandle(
  timeframe: Timeframe,
  asOf: number
): number {
  const step = intervalMs(timeframe);
  const remainder = asOf % step;
  // Floor to the bar boundary, then subtract one full bar so the result is the
  // open time of the most recent bar that has CLOSED at or before asOf.
  const lastBoundary = asOf - remainder;
  return lastBoundary - step;
}