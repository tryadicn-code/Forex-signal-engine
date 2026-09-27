/**
 * Canonical normalization.
 *
 * Converts a provider's native bars into the internal {@link CanonicalCandle}
 * shape. This is the ONLY place vendor data becomes engine data, so any quirk
 * (inverted fields, seconds-vs-ms epochs, missing volume) is absorbed here and
 * never leaks into `src/core`.
 */

import type { Timeframe } from "@/types/market";
import type { CanonicalCandle } from "@/types/market-data";
import { isCandleClosed } from "./timeframe";

/** Loose input shape: any source whose fields map onto OHLCV. */
export interface RawCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface NormalizeOptions {
  symbol: string;
  timeframe: Timeframe;
  source: string;
  /** Analysis time used to decide which bars are already closed. */
  asOf: number;
  /** Multiplier when a feed reports timestamps in seconds. */
  timestampIsSeconds?: boolean;
  /** Volume to substitute when a feed omits it. */
  defaultVolume?: number;
}

export function normalizeCandles(
  raw: RawCandle[],
  options: NormalizeOptions
): CanonicalCandle[] {
  const { symbol, timeframe, source, asOf } = options;
  const scale = options.timestampIsSeconds ? 1000 : 1;
  const defaultVolume = options.defaultVolume ?? 0;
  return raw.map((bar) => {
    const timestamp = Math.round(bar.timestamp * scale);
    return {
      symbol,
      timeframe,
      timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume ?? defaultVolume,
      source,
      closed: isCandleClosed(timeframe, timestamp, asOf),
    };
  });
}