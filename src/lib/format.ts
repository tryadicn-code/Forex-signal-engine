/**
 * Presentation formatters.
 *
 * Pure functions over already-computed values. Nothing here derives a price,
 * a score or a decision - these only shape how an existing number is printed,
 * and every missing value degrades to an explicit placeholder.
 */

import { SYMBOL_METADATA } from "@/config/scanner";

/** Explicit "no value" marker, so absence is never rendered as 0 or blank. */
export const NOT_AVAILABLE = "—";
export const NOT_EVALUATED = "Not evaluated";

/** Decimal precision for a symbol's price, from instrument metadata. */
export function pricePrecision(symbol: string): number {
  return SYMBOL_METADATA[symbol]?.pricePrecision ?? 5;
}

/** Format a price at the instrument's native precision. */
export function formatPrice(symbol: string, price: number | null | undefined): string {
  if (price === null || price === undefined || !Number.isFinite(price)) return NOT_AVAILABLE;
  return price.toFixed(pricePrecision(symbol));
}

/** Format an unsigned number to a fixed scale. */
export function formatFixed(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return value.toFixed(digits);
}

/** Ratio (R:R) as a compact "1:x" string. */
export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return "1:" + value.toFixed(2);
}

/** Pips, with an explicit sign for distances that can be negative. */
export function formatPips(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  const rounded = Math.round(value * 10) / 10;
  const text = rounded.toFixed(1);
  return signed && rounded > 0 ? "+" + text : text;
}

/** Score on the 0-100 engine scale. */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return Math.round(value).toString();
}

/**
 * UTC clock time. The scanner's times are market times (UTC epoch ms), so the
 * dashboard reports UTC to stay truthful about what the timestamp means.
 */
export function formatTime(epoch: number | null | undefined): string {
  if (epoch === null || epoch === undefined || !Number.isFinite(epoch)) return NOT_AVAILABLE;
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return NOT_AVAILABLE;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }) + " UTC";
}

/** Short HH:MM UTC, for dense tables and history rows. */
export function formatTimeShort(epoch: number | null | undefined): string {
  if (epoch === null || epoch === undefined || !Number.isFinite(epoch)) return NOT_AVAILABLE;
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return NOT_AVAILABLE;
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

/** Duration in milliseconds as a compact human string. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return NOT_AVAILABLE;
  if (ms < 1000) return Math.round(ms) + " ms";
  if (ms < 60_000) return (ms / 1000).toFixed(1) + " s";
  return (ms / 60_000).toFixed(1) + " min";
}
