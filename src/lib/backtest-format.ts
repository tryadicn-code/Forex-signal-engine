/**
 * Shared formatting helpers for backtest workbenches.
 *
 * These were duplicated across the validation, robustness, statistical
 * diagnostics, and strategy-version-registry workbenches. Centralising them
 * keeps null handling and unit suffixes consistent across the reports.
 */

const EM_DASH = "—";

export function formatNumber(
  value: number | null | undefined,
  digits: number
): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? EM_DASH
    : value.toFixed(digits);
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? EM_DASH
    : value.toFixed(2) + "%";
}

export function formatSigned(
  value: number | null | undefined,
  digits: number
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EM_DASH;
  }
  return (value > 0 ? "+" : "") + value.toFixed(digits);
}

export function formatShortDate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EM_DASH;
  }
  return new Date(value).toISOString().slice(0, 10);
}

export function formatUtc(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EM_DASH;
  }
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}