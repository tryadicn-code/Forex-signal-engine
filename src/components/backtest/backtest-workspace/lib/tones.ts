export function toneForExpectancy(
  v: number | null
): "positive" | "negative" | "muted" {
  if (v === null || !Number.isFinite(v) || v === 0) return "muted";
  return v > 0 ? "positive" : "negative";
}

export function toneForWinRate(v: number | null): "positive" | "warn" | "muted" {
  if (v === null || !Number.isFinite(v)) return "muted";
  return v >= 50 ? "positive" : "warn";
}

export function toneForProfitFactor(
  v: number | null
): "positive" | "warn" | "negative" | "muted" {
  if (v === null || !Number.isFinite(v)) return "muted";
  if (v >= 2) return "positive";
  if (v >= 1) return "warn";
  return "negative";
}