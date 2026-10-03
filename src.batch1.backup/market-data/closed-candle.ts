/**
 * Closed-candle safety.
 *
 * Phase 1 engines must never see an unfinished bar: an in-progress M15 candle
 * must not create a "confirmed" BOS, CHOCH or trigger, because its high/low can
 * still move. This module drops every candle whose interval has not fully
 * elapsed at the analysis time, leaving only bars that are historical facts.
 *
 * Together with the no-look-ahead window (which drops bars AFTER the analysis
 * time), this guarantees the engines only ever observe candles closed at or
 * before T.
 */

import type { Timeframe } from "@/types/market";
import type { CanonicalCandle } from "@/types/market-data";
import { isCandleClosed, candleCloseTime } from "./timeframe";

export interface ClosedCandleResult {
  /** Only the candles that had fully closed at or before `asOf`. */
  candles: CanonicalCandle[];
  /** How many in-progress candles were dropped. */
  droppedOpen: number;
  /** How many future candles (close time after asOf) were dropped. */
  droppedFuture: number;
}

/**
 * Keep only candles that were fully closed at or before `asOf`.
 *
 * An unfinished candle is not merely "uncertain" - its high/low are still being
 * written, so any swing or break derived from it could be undone. It is dropped
 * rather than clamped.
 */
export function filterClosedCandles(
  candles: CanonicalCandle[],
  timeframe: Timeframe,
  asOf: number
): ClosedCandleResult {
  const kept: CanonicalCandle[] = [];
  let droppedOpen = 0;
  let droppedFuture = 0;

  for (const candle of candles) {
    const closeTime = candleCloseTime(timeframe, candle.timestamp);
    if (closeTime <= asOf) {
      kept.push(candle);
    } else if (candle.timestamp <= asOf) {
      // The bar opened at or before T but had not closed: in progress.
      droppedOpen++;
    } else {
      // The bar opened after T: future data, rejected for look-ahead safety.
      droppedFuture++;
    }
  }

  return { candles: kept, droppedOpen, droppedFuture };
}

/** True when the newest candle of the series was fully closed at `asOf`. */
export function newestIsClosed(
  candles: CanonicalCandle[],
  timeframe: Timeframe,
  asOf: number
): boolean {
  const last = candles[candles.length - 1];
  if (!last) return false;
  return isCandleClosed(timeframe, last.timestamp, asOf);
}