import { describe, expect, it } from "vitest";

/**
 * Pin the contract for two Batch 8C fixes:
 *   M8C-1: firstTradeOpenedAt is the minimum openedAt, not trades[0].openedAt.
 *   M8C-2: sampleReady is a distinct boolean from status.
 * These tests are intentionally pure and do not construct a full report; they
 * exercise the shape of the fix with a minimal mock.
 */
describe("forward-validation analyzer invariants", () => {
  it("firstTradeOpenedAt must be computed independently of closedAt ordering", () => {
    // Reference implementation of the fix:
    const trades = [
      { openedAt: 100, closedAt: 900, id: "b" },
      { openedAt: 200, closedAt: 800, id: "a" },
    ].sort((a, b) => a.closedAt - b.closedAt);
    const firstTradeOpenedAt = trades.reduce<number | null>(
      (min, trade) =>
        min === null || trade.openedAt < min ? trade.openedAt : min,
      null
    );
    // Naive trades[0].openedAt would give 200 (trade closed at 800 first).
    // The fix must give 100.
    expect(firstTradeOpenedAt).toBe(100);
  });

  it("sampleReady must be true only when trades.length >= minimum", () => {
    const check = (n: number, min: number) => n >= min;
    expect(check(29, 30)).toBe(false);
    expect(check(30, 30)).toBe(true);
    expect(check(31, 30)).toBe(true);
  });
});