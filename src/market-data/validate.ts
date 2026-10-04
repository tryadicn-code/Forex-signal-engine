/**
 * Market-data validation.
 *
 * Every candle series the scanner analyses is validated here BEFORE it reaches
 * a Phase 1 engine. Malformed data is never silently hidden: unusable candles
 * are dropped AND reported as structured issues, so the scanner can decide (and
 * the API can surface) exactly what was wrong.
 *
 * Per-candle checks:
 *  - NaN / Infinity in any OHLCV field        -> NON_FINITE
 *  - non-positive timestamp                   -> INVALID_TIMESTAMP
 *  - duplicate candle (same timestamp)        -> DUPLICATE_TIMESTAMP
 *  - out-of-order timestamp                   -> OUT_OF_ORDER
 *  - non-positive price                       -> NEGATIVE_PRICE
 *  - degenerate zero high/low                 -> ZERO_PRICE
 *  - high < open/close/low, low > open/close  -> MALFORMED_OHLC
 *
 * Series-level checks:
 *  - a gap larger than one interval           -> MISSING_INTERVAL
 *  - newest closed candle older than allowed  -> STALE_DATA
 *
 * A candle that fails a per-candle check is unusable and is dropped from the
 * returned series, but the issue is preserved. The series is `valid` when
 * enough usable candles survive to run analysis; the scanner still receives the
 * full issue list so nothing is hidden.
 */

import type { Timeframe } from "@/types/market";
import type {
  CanonicalCandle,
  ValidationIssue,
  ValidationIssueCode,
  ValidationResult,
} from "@/types/market-data";
import { intervalMs, candleCloseTime } from "./timeframe";

const PIP_TOLERANCE = 1e-9;
const GAP_TOLERANCE_MS = 1;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Checks that make a single candle unusable; the candle is dropped + reported. */
const UNUSABLE_CODES: readonly ValidationIssueCode[] = [
  "NON_FINITE",
  "INVALID_TIMESTAMP",
  "DUPLICATE_TIMESTAMP",
  "OUT_OF_ORDER",
  "NEGATIVE_PRICE",
  "ZERO_PRICE",
  "MALFORMED_OHLC",
];

export interface ValidateOptions {
  symbol: string;
  timeframe: Timeframe;
  /** Analysis time; used for the stale-data check. */
  asOf: number;
  /** A series older than this at its newest closed candle is flagged stale. */
  staleAfterMs: number;
  /** Minimum usable candles required for the series to count as valid. */
  minBars?: number;
}

export function validateCandles(
  candles: CanonicalCandle[],
  options: ValidateOptions
): ValidationResult {
  const { symbol, timeframe, asOf, staleAfterMs } = options;
  const minBars = options.minBars ?? 50;
  const issues: ValidationIssue[] = [];
  const usable: CanonicalCandle[] = [];

  const seenTimestamps = new Set<number>();
  let lastTimestamp: number | null = null;

  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index];
    const base: Pick<ValidationIssue, "symbol" | "timeframe" | "index" | "timestamp"> = {
      symbol,
      timeframe,
      index,
      timestamp: candle.timestamp,
    };

    if (
      !isFiniteNumber(candle.timestamp) ||
      !isFiniteNumber(candle.open) ||
      !isFiniteNumber(candle.high) ||
      !isFiniteNumber(candle.low) ||
      !isFiniteNumber(candle.close) ||
      !isFiniteNumber(candle.volume)
    ) {
      issues.push({ ...base, code: "NON_FINITE", message: "Candle contains NaN or Infinity in timestamp/OHLCV fields." });
      continue;
    }

    if (candle.timestamp <= 0) {
      issues.push({ ...base, code: "INVALID_TIMESTAMP", message: `Timestamp ${candle.timestamp} is not a positive epoch millisecond.` });
      continue;
    }

    if (seenTimestamps.has(candle.timestamp)) {
      issues.push({ ...base, code: "DUPLICATE_TIMESTAMP", message: `Duplicate candle at ${candle.timestamp}; the earlier copy is kept.` });
      continue;
    }

    if (lastTimestamp !== null && candle.timestamp < lastTimestamp) {
      issues.push({ ...base, code: "OUT_OF_ORDER", message: `Candle ${candle.timestamp} precedes the previous candle ${lastTimestamp}.` });
      continue;
    }

    const { open, high, low, close } = candle;
    if (!(open > 0) || !(high > 0) || !(low > 0) || !(close > 0)) {
      issues.push({ ...base, code: "NEGATIVE_PRICE", message: "OHLC prices must be positive; a non-positive price is unusable." });
      continue;
    }

    const malformed: string[] = [];
    if (!(high >= open - PIP_TOLERANCE)) malformed.push("high < open");
    if (!(high >= close - PIP_TOLERANCE)) malformed.push("high < close");
    if (!(high >= low - PIP_TOLERANCE)) malformed.push("high < low");
    if (!(low <= open + PIP_TOLERANCE)) malformed.push("low > open");
    if (!(low <= close + PIP_TOLERANCE)) malformed.push("low > close");
    if (malformed.length > 0) {
      issues.push({ ...base, code: "MALFORMED_OHLC", message: `Malformed OHLC: ${malformed.join(", ")}.` });
      continue;
    }

    if (lastTimestamp !== null) {
      const gap = candle.timestamp - lastTimestamp;
      const expected = intervalMs(timeframe);
      if (gap > expected + GAP_TOLERANCE_MS) {
        issues.push({ ...base, code: "MISSING_INTERVAL", message: `Gap of ${gap}ms between ${lastTimestamp} and ${candle.timestamp} exceeds the ${expected}ms interval.` });
      }
    }

    seenTimestamps.add(candle.timestamp);
    lastTimestamp = candle.timestamp;
    usable.push(candle);
  }

  const lastUsable = usable[usable.length - 1];
  if (lastUsable) {
    const age = asOf - candleCloseTime(timeframe, lastUsable.timestamp);
    if (age > staleAfterMs) {
      issues.push({
        symbol,
        timeframe,
        code: "STALE_DATA",
        timestamp: lastUsable.timestamp,
        message: `Newest closed candle is ${Math.round(age / 1000)}s old at the analysis time.`,
      });
    }
  }

  return {
    valid: usable.length >= minBars,
    candles: usable,
    issues,
  };
}

/** Convenience wrapper preserving the original positional signature. */
export function validateSeries(
  candles: CanonicalCandle[],
  asOf: number,
  staleAfterMs: number
): ValidationResult {
  const symbol = candles[0]?.symbol ?? "UNKNOWN";
  const timeframe: Timeframe = candles[0]?.timeframe ?? "M15";
  return validateCandles(candles, { symbol, timeframe, asOf, staleAfterMs });
}

export { UNUSABLE_CODES };