import { SYMBOL_METADATA } from "@/config/scanner";
import type { AlertCandidate } from "@/notifications/types";

/**
 * Format an alert into the message text sent to a notification channel.
 *
 * N8B-1: all non-ASCII glyphs are written as unicode escape sequences so the
 * source file stays pure ASCII on disk and cannot be corrupted by PowerShell
 * or any other tool that assumes Windows-1252.
 */

const SEPARATOR = " \u00B7 ";    // middle dot
const BULLET = "\u2022 ";         // bullet
const EM_DASH = "\u2014";         // em dash

export function formatAlertMessage(
  alert: AlertCandidate,
  timeZone: string
): string {
  const title = alertTitle(alert.state);
  const precision = SYMBOL_METADATA[alert.symbol]?.pricePrecision ?? 5;
  const lines: string[] = [
    title,
    "",
    alert.symbol + SEPARATOR + alert.direction,
    "Status: " + alert.state,
    "",
    scoreLine("Bias", alert.biasScore),
    scoreLine("Setup", alert.setupScore),
    scoreLine("Trigger", alert.triggerScore),
    "RR: " + number(alert.riskReward, 2, "R"),
  ];

  if (alert.entryPrice !== null) {
    lines.push("Entry: " + number(alert.entryPrice, precision));
  }
  if (alert.stopLoss !== null) {
    lines.push("SL: " + number(alert.stopLoss, precision));
  }
  if (alert.takeProfit1 !== null) {
    lines.push("TP1: " + number(alert.takeProfit1, precision));
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
      lines.push(BULLET + item);
    }
  }

  if (alert.blockers.length > 0) {
    lines.push("", "Blockers:");
    for (const item of alert.blockers.slice(0, 6)) {
      lines.push(BULLET + item);
    }
  }

  lines.push(
    "",
    "Freshness: " + (alert.freshness ?? EM_DASH),
    "Strategy: " + (alert.strategyId ?? "Legacy / unknown"),
    "Release: " + alert.strategyVersion,
    "Signal: " + alert.signalId,
    "Time: " + formatTime(alert.detectedAt, timeZone)
  );

  // N8B-13: filter out null/undefined entries only. The previous string
  // comparison against "null" could drop legitimate content that happens
  // to equal the literal word "null".
  return lines.filter((line) => line != null && line !== "").join("\n");
}

function alertTitle(state: AlertCandidate["state"]): string {
  switch (state) {
    case "NEAR_EXECUTE":
      return "\u26A0\uFE0F FSE NEAR EXECUTE";
    case "EXECUTE_READY":
      return "\uD83D\uDEA8 FSE EXECUTE READY";
    case "BLOCKED":
      return "\u26D4 FSE SIGNAL BLOCKED";
    case "INVALIDATED":
      return "\u274C FSE SIGNAL INVALIDATED";
    case "WATCH":
      return "\uD83D\uDC40 FSE WATCH";
  }
}

function scoreLine(label: string, value: number | null): string {
  return label + ": " + (value === null ? EM_DASH : value.toFixed(0));
}

function number(
  value: number | null,
  digits: number,
  suffix = ""
): string {
  if (value === null || !Number.isFinite(value)) return EM_DASH;
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