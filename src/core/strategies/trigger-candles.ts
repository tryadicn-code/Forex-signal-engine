import type { OHLCV } from "@/types/market";

/**
 * C2 fix: resolve the trigger candle set defensively.
 *
 * The scanner is contractually responsible for delivering closed candles only
 * (buildMarketContext runs the closed-candle filter). The previous strategy
 * code defaulted to `slice(0, -1)` when `closedOnly` was unset, silently
 * dropping the newest closed bar and delaying every trigger by one bar.
 *
 * New contract:
 *   - closedOnly === false  -> the caller explicitly says the last bar may be
 *                             live; strip it.
 *   - anything else         -> use every supplied candle (they are closed).
 */
export function resolveTriggerCandles(
  closedOnly: boolean | undefined,
  candles: OHLCV[]
): OHLCV[] {
  return closedOnly === false ? candles.slice(0, -1) : candles;
}