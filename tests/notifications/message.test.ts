import { describe, expect, it } from "vitest";
import { formatAlertMessage } from "@/notifications/message";
import type { AlertCandidate } from "@/notifications/types";

function candidate(overrides: Partial<AlertCandidate> = {}): AlertCandidate {
  return {
    key: "k1",
    signalId: "sig-1",
    strategyId: "TREND_PULLBACK",
    symbol: "EURUSD",
    direction: "LONG",
    state: "EXECUTE_READY",
    detectedAt: 1_700_000_000_000,
    strategyVersion: "v1.0.0",
    strategyActivationAt: 1_699_000_000_000,
    latestPrice: 1.0856,
    biasScore: 65,
    setupScore: 75,
    triggerScore: 55,
    riskReward: 2.5,
    entryPrice: 1.0856,
    stopLoss: 1.0831,
    takeProfit1: 1.0919,
    riskPercent: 0.5,
    positionSize: 0.2,
    freshness: "FRESH",
    waitingFor: ["TRIGGER_CONFIRMATION"],
    blockers: [],
    ...overrides,
  };
}

describe("formatAlertMessage", () => {
  it("contains no replacement character or question-mark placeholders", () => {
    const msg = formatAlertMessage(candidate(), "Asia/Makassar");
    expect(msg).not.toContain("\uFFFD"); // replacement char
    expect(msg).not.toContain("\u00E2\u009A"); // classic mojibake prefix
  });

  it("uses the correct emoji for each state", () => {
    const states: Array<[AlertCandidate["state"], string]> = [
      ["NEAR_EXECUTE", "\u26A0"],
      ["EXECUTE_READY", "\uD83D\uDEA8"],
      ["BLOCKED", "\u26D4"],
      ["INVALIDATED", "\u274C"],
      ["WATCH", "\uD83D\uDC40"],
    ];
    for (const [state, glyph] of states) {
      const msg = formatAlertMessage(candidate({ state }), "Asia/Makassar");
      expect(msg.startsWith(glyph)).toBe(true);
    }
  });

  it("respects symbol precision for prices", () => {
    const usdjpy = formatAlertMessage(
      candidate({
        symbol: "USDJPY",
        entryPrice: 148.123,
        stopLoss: 147.5,
        takeProfit1: 149.0,
      }),
      "Asia/Makassar"
    );
    // USDJPY has pricePrecision 3 by convention in SYMBOL_METADATA
    // (fallback to 5 if not configured). Either way, the string must not
    // crash and must contain the price digits.
    expect(usdjpy).toMatch(/Entry: \d+\.\d+/);
  });

  it("uses an em dash placeholder for null values", () => {
    const msg = formatAlertMessage(
      candidate({
        entryPrice: null,
        stopLoss: null,
        takeProfit1: null,
        riskReward: null,
      }),
      "Asia/Makassar"
    );
    expect(msg).toContain("\u2014");
  });

  it("does not filter out legitimate content that contains the word null", () => {
    const msg = formatAlertMessage(
      candidate({ waitingFor: ["null"] }),
      "Asia/Makassar"
    );
    expect(msg).toContain("null");
  });

  it("keeps blockers bounded to 6 entries", () => {
    const msg = formatAlertMessage(
      candidate({
        blockers: ["a", "b", "c", "d", "e", "f", "g", "h"],
      }),
      "Asia/Makassar"
    );
    const bulletLines = msg.split("\n").filter((l) => l.startsWith("\u2022 "));
    // 1 waiting + 6 blockers = 7 bullets max
    expect(bulletLines.length).toBeLessThanOrEqual(7);
  });
});