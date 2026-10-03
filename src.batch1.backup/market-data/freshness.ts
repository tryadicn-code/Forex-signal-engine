/**
 * Data-freshness classification.
 *
 * Age is measured on the MARKET clock: how old is the newest closed candle of a
 * timeframe at the analysis time. This keeps replay/backtesting honest - a
 * historical series is compared against its own market time, never the wall
 * clock.
 *
 * Thresholds are TIMEFRAME-RELATIVE, expressed in bars. A D1 bar that closed 20
 * hours ago is perfectly fresh for D1, while an M15 bar that closed 20 hours ago
 * is badly stale. Comparing both against one absolute millisecond threshold
 * would either flag every higher timeframe as stale or never flag anything.
 */

import type {
  Freshness,
  FreshnessStatus,
} from "@/types/market-data";
import type { FreshnessThresholds } from "@/config/scanner";
import { candleCloseTime, intervalMs } from "./timeframe";
import type { Timeframe } from "@/types/market";

/**
 * Classify an age (ms) for a specific timeframe using bar-relative thresholds.
 * `freshBars = 1.5` means "FRESH as long as we are not missing more than about
 * half a bar past the expected close".
 */
export function classifyFreshness(
  ageMs: number,
  timeframe: Timeframe,
  thresholds: FreshnessThresholds
): FreshnessStatus {
  const bar = intervalMs(timeframe);
  if (ageMs <= thresholds.freshBars * bar) return "FRESH";
  if (ageMs <= thresholds.delayedBars * bar) return "DELAYED";
  return "STALE";
}

export interface FreshnessInput {
  source: string;
  timeframe: Timeframe;
  /** Open timestamp of the newest closed candle. */
  newestCandleTimestamp: number | undefined;
  /** Analysis time, UTC epoch ms. */
  receivedAt: number;
  thresholds: FreshnessThresholds;
}

/**
 * Build the freshness record for one timeframe's data.
 *
 * MISSING DATA IS EXPLICITLY STALE. When there is no newest closed candle there
 * is nothing to classify: the layer must never fabricate a market timestamp
 * (which would make the age zero and the data look FRESH). Instead the record is
 * marked {@link Freshness.missing} with an infinite age, so "no candles" and
 * "current candles" are two genuinely different outcomes and the data-quality
 * gate downstream can tell them apart.
 */
export function timeframeFreshness(input: FreshnessInput): Freshness {
  if (input.newestCandleTimestamp === undefined) {
    return {
      source: input.source,
      marketTimestamp: null,
      receivedAt: input.receivedAt,
      ageMs: Number.POSITIVE_INFINITY,
      missing: true,
      status: "STALE",
    };
  }

  const marketTimestamp = candleCloseTime(
    input.timeframe,
    input.newestCandleTimestamp
  );
  const ageMs = Math.max(0, input.receivedAt - marketTimestamp);
  return {
    source: input.source,
    marketTimestamp,
    receivedAt: input.receivedAt,
    ageMs,
    missing: false,
    status: classifyFreshness(ageMs, input.timeframe, input.thresholds),
  };
}

/**
 * Roll per-timeframe freshness up into one overall status for a market context.
 * The worst status wins, because execution safety follows the weakest link.
 * Missing data is STALE, so a timeframe with no candles drags the rollup down.
 */
export function rollupFreshness(
  statuses: FreshnessStatus[]
): FreshnessStatus {
  if (statuses.includes("STALE")) return "STALE";
  if (statuses.includes("DELAYED")) return "DELAYED";
  return "FRESH";
}
