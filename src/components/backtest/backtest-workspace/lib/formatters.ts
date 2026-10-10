export function formatUtc(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  return "UTC" + sign + hours + (mins ? ":" + String(mins).padStart(2, "0") : "");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function formatNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : value.toFixed(digits);
}

export function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : value.toFixed(2) + "%";
}

export function signedPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(2) + "%";
}

export function formatSigned(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(digits);
}