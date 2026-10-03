import { describe, expect, it } from "vitest";

/**
 * Mirrors the helper logic in backtest-analytics.ts so we can test the
 * formulas independently. If the helpers there change, update this fixture.
 */
function computeSharpeR(rValues: number[]): number | null {
  if (rValues.length === 0) return null;
  const mean = rValues.reduce((s, v) => s + v, 0) / rValues.length;
  const variance =
    rValues.reduce((s, v) => s + (v - mean) ** 2, 0) / rValues.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return null;
  return mean / sd;
}

function computeSortinoR(rValues: number[]): number | null {
  if (rValues.length === 0) return null;
  const mean = rValues.reduce((s, v) => s + v, 0) / rValues.length;
  const downside = rValues.filter((r) => r < 0);
  if (downside.length === 0) return null;
  const downsideVariance =
    downside.reduce((s, r) => s + r * r, 0) / rValues.length;
  const downsideDev = Math.sqrt(downsideVariance);
  if (downsideDev === 0) return null;
  return mean / downsideDev;
}

describe("Sharpe/Sortino per-trade (Tahap B)", () => {
  it("returns null for empty input", () => {
    expect(computeSharpeR([])).toBeNull();
    expect(computeSortinoR([])).toBeNull();
  });

  it("returns null for Sharpe when all returns are identical", () => {
    expect(computeSharpeR([1, 1, 1, 1])).toBeNull();
  });

  it("returns null for Sortino when there are no losers", () => {
    expect(computeSortinoR([1, 2, 3, 4])).toBeNull();
  });

  it("computes positive Sharpe for mean above zero", () => {
    const s = computeSharpeR([2, -1, 2, -1, 2, -1]);
    expect(s).not.toBeNull();
    expect(s!).toBeGreaterThan(0);
  });

  it("computes negative Sharpe for mean below zero", () => {
    const s = computeSharpeR([1, -2, 1, -2, 1, -2]);
    expect(s).not.toBeNull();
    expect(s!).toBeLessThan(0);
  });

  it("Sortino is larger than Sharpe when losses are small", () => {
    const r = [3, -0.5, 3, -0.5, 3, -0.5];
    const s = computeSharpeR(r)!;
    const so = computeSortinoR(r)!;
    expect(so).toBeGreaterThan(s);
  });
});