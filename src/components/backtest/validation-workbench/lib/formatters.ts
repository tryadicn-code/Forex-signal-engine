export function signedPercent(value: number): string {
  return (value > 0 ? "+" : "") + value.toFixed(2) + "%";
}

export function formatGeneric(value: string | number | null): string {
  if (value === null) return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return value.toFixed(2);
  }
  return value;
}

export function formatGenericDelta(value: string | number | null): string {
  if (value === null) return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return (value > 0 ? "+" : "") + value.toFixed(2);
  }
  return value;
}