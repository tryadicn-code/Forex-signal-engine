import type { OHLCV } from "@/types/market";
import type { SetupResultData, TriggerResultData } from "@/types/engine";

/**
 * Resolve the entry price for a CONFIRMED trigger.
 *
 * The entry is the CLOSE of the trigger bar itself, never the latest bar in
 * the array. Using the latest bar misprices R:R whenever a trigger is
 * confirmed several bars late, and leaks lookahead if the final candle is
 * still forming.
 *
 * Fallback order:
 *  1. Close of the trigger bar (if triggerIndex is a valid index).
 *  2. Midpoint of the setup zone (only when the trigger bar cannot be located).
 */
export function resolveEntryPrice(
  candles: readonly OHLCV[],
  setup: SetupResultData,
  trigger: TriggerResultData
): number {
  const idx = trigger.triggerIndex;
  if (idx !== null && idx >= 0 && idx < candles.length) {
    return candles[idx].close;
  }
  return (setup.zoneHigh + setup.zoneLow) / 2;
}