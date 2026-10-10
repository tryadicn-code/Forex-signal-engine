export function money(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${currency} ${value.toFixed(2)}`;
}

export function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(2) + "%";
}

export function pnlTone(value: number | null): "neutral" | "positive" | "negative" {
  if (value === null || !Number.isFinite(value) || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

export function riskReward(
  entryPrice: number,
  takeProfit: number | null,
  stopLoss: number
): string {
  if (takeProfit === null) return "—";

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);

  if (
    !Number.isFinite(risk) ||
    !Number.isFinite(reward) ||
    risk <= 0 ||
    reward < 0
  ) {
    return "—";
  }

  return `1:${(reward / risk).toFixed(2)}`;
}