import type { AlertCandidate } from "@/notifications/types";

export function formatAlertMessage(
  alert: AlertCandidate,
  timeZone: string
): string {
  const title = alertTitle(alert.state);
  const lines = [
    title,
    "",
    alert.symbol + " · " + alert.direction,
    "Status: " + alert.state,
    "",
    scoreLine("Bias", alert.biasScore),
    scoreLine("Setup", alert.setupScore),
    scoreLine("Trigger", alert.triggerScore),
    "RR: " + number(alert.riskReward, 2, "R"),
  ];

  if (alert.entryPrice !== null) {
    lines.push("Entry: " + number(alert.entryPrice, 5));
  }
  if (alert.stopLoss !== null) {
    lines.push("SL: " + number(alert.stopLoss, 5));
  }
  if (alert.takeProfit1 !== null) {
    lines.push("TP1: " + number(alert.takeProfit1, 5));
  }
  if (alert.riskPercent !== null) {
    lines.push("Risk: " + number(alert.riskPercent, 2, "%"));
  }
  if (alert.positionSize !== null) {
    lines.push("Lot: " + number(alert.positionSize, 2));
  }

  if (alert.waitingFor.length > 0) {
    lines.push("", "Waiting:");
    for (const item of alert.waitingFor) {
      lines.push("• " + item);
    }
  }

  if (alert.blockers.length > 0) {
    lines.push("", "Blockers:");
    for (const item of alert.blockers.slice(0, 6)) {
      lines.push("• " + item);
    }
  }

  lines.push(
    "",
    "Freshness: " + (alert.freshness ?? "—"),
    "Strategy: " + (alert.strategyId ?? "Legacy / unknown"),
    "Release: " + alert.strategyVersion,
    "Signal: " + alert.signalId,
    "Time: " + formatTime(alert.detectedAt, timeZone)
  );

  return lines.filter((line) => line !== "null").join("\n");
}

function alertTitle(state: AlertCandidate["state"]): string {
  switch (state) {
    case "NEAR_EXECUTE":
      return "⚠️ FSE NEAR EXECUTE";
    case "EXECUTE_READY":
      return "🚨 FSE EXECUTE READY";
    case "BLOCKED":
      return "⛔ FSE SIGNAL BLOCKED";
    case "INVALIDATED":
      return "❌ FSE SIGNAL INVALIDATED";
    case "WATCH":
      return "👀 FSE WATCH";
  }
}

function scoreLine(label: string, value: number | null): string {
  return label + ": " + (value === null ? "—" : value.toFixed(0));
}

function number(
  value: number | null,
  digits: number,
  suffix = ""
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits) + suffix;
}

function formatTime(value: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return new Date(value).toISOString();
  }
}
