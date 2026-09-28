/**
 * Presentation formatters.
 *
 * Pure functions over already-computed values. Nothing here derives a price,
 * a score or a decision - these only shape how an existing number is printed,
 * and every missing value degrades to an explicit placeholder.
 */

import { SYMBOL_METADATA } from "@/config/scanner";

export const NOT_AVAILABLE = "—";
export const NOT_EVALUATED = "Not evaluated";

export function pricePrecision(symbol: string): number {
  return SYMBOL_METADATA[symbol]?.pricePrecision ?? 5;
}

export function formatPrice(symbol: string, price: number | null | undefined): string {
  if (price === null || price === undefined || !Number.isFinite(price)) return NOT_AVAILABLE;
  return price.toFixed(pricePrecision(symbol));
}

export function formatFixed(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return value.toFixed(digits);
}

export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return "1:" + value.toFixed(2);
}

export function formatPips(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  const rounded = Math.round(value * 10) / 10;
  const text = rounded.toFixed(1);
  return signed && rounded > 0 ? "+" + text : text;
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return Math.round(value).toString();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Deterministic UTC clock formatting.
 *
 * Do not use locale-sensitive formatting in the server/client shared render
 * path: differing ICU implementations can produce hydration mismatches.
 */
export function formatTime(epoch: number | null | undefined): string {
  if (epoch === null || epoch === undefined || !Number.isFinite(epoch)) return NOT_AVAILABLE;
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return NOT_AVAILABLE;
  return (
    pad2(d.getUTCHours()) +
    ":" +
    pad2(d.getUTCMinutes()) +
    ":" +
    pad2(d.getUTCSeconds()) +
    " UTC"
  );
}

export function formatTimeShort(epoch: number | null | undefined): string {
  if (epoch === null || epoch === undefined || !Number.isFinite(epoch)) return NOT_AVAILABLE;
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return NOT_AVAILABLE;
  return pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return NOT_AVAILABLE;
  if (ms < 1000) return Math.round(ms) + " ms";
  if (ms < 60_000) return (ms / 1000).toFixed(1) + " s";
  return (ms / 60_000).toFixed(1) + " min";
}
