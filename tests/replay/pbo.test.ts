import { describe, expect, it } from "vitest";
import {
  pathRobustnessDiagnostic,
  probabilityOfBacktestOverfitting,
} from "@/replay/pbo";

/** xorshift32: fast, deterministic, well-distributed on 32-bit state. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

function strongReturns(n: number, edge: number): number[] {
  const rng = makeRng(0xFEED);
  return Array.from({ length: n }, () => edge + (rng() * 2 - 1) * 0.5);
}

function noiseReturns(n: number, seedOffset = 0): number[] {
  // Distinct seedOffset gives each strategy its own series; without this,
  // Array.from(() => noiseReturns(n)) produces N identical strategies.
  const rng = makeRng(0xC0FFEE + seedOffset * 0xBEEF);
  return Array.from({ length: n }, () => rng() * 2 - 1);
}

describe("probabilityOfBacktestOverfitting", () => {
  it("rejects single-strategy input", () => {
    expect(() =>
      probabilityOfBacktestOverfitting({ strategies: [[1, -1, 1, -1, 1]] })
    ).toThrow(/at least 2 strategies/);
  });

  it("rejects uneven strategy lengths", () => {
    expect(() =>
      probabilityOfBacktestOverfitting({
        strategies: [[1, 2, 3, 4], [1, 2, 3]],
      })
    ).toThrow(/same observation count/);
  });

  it("rejects odd blockCount", () => {
    expect(() =>
      probabilityOfBacktestOverfitting({
        strategies: [strongReturns(100, 1), noiseReturns(100)],
        blockCount: 9,
      })
    ).toThrow(/even integer/);
  });

  it("rejects insufficient observations", () => {
    expect(() =>
      probabilityOfBacktestOverfitting({
        strategies: [strongReturns(10, 1), noiseReturns(10)],
        blockCount: 10,
      })
    ).toThrow(/T >= 2 \* S/);
  });

  it("clear outperformer gives low PBO", () => {
    const winner = strongReturns(400, 2);
    const losers = Array.from({ length: 5 }, () => noiseReturns(400));
    const r = probabilityOfBacktestOverfitting({
      strategies: [winner, ...losers],
      blockCount: 10,
    });
    expect(r.probabilityOfBacktestOverfitting).toBeLessThan(0.2);
  });

  it("all noise strategies give PBO near 0.5", () => {
    const strategies = Array.from({ length: 10 }, (_, i) => noiseReturns(500, i));
    const r = probabilityOfBacktestOverfitting({
      strategies,
      blockCount: 10,
    });
    // With pure noise, the best IS strategy is random; its OOS rank should
    // be roughly uniform. Accept a wide band to avoid flakiness.
    expect(r.probabilityOfBacktestOverfitting).toBeGreaterThan(0.2);
    expect(r.probabilityOfBacktestOverfitting).toBeLessThan(0.8);
  });

  it("enumerates the correct number of combinations", () => {
    const r = probabilityOfBacktestOverfitting({
      strategies: [strongReturns(200, 1), noiseReturns(200)],
      blockCount: 10,
    });
    // C(10, 5) = 252
    expect(r.combinations).toBe(252);
  });
});

describe("pathRobustnessDiagnostic", () => {
  it("rejects too few observations", () => {
    expect(() =>
      pathRobustnessDiagnostic({ returns: [1, 2, 3] })
    ).toThrow(/at least 4/);
  });

  it("rejects non-finite returns", () => {
    expect(() =>
      pathRobustnessDiagnostic({
        returns: [1, 2, NaN, 4, 5, 6, 7, 8, 9, 10],
        blockCount: 4,
      })
    ).toThrow(/finite/);
  });

  it("stable positive strategy has low failure rate", () => {
    const r = pathRobustnessDiagnostic({
      returns: strongReturns(400, 1),
      blockCount: 10,
    });
    expect(r.outOfSampleFailureRate).toBe(0);
    expect(r.robustnessScore).toBe(1);
    expect(r.outOfSampleSharpeMean).toBeGreaterThan(0);
  });

  it("sign-flipping strategy has high failure rate", () => {
    // Alternate blocks: strong positive then strong negative.
    const returns: number[] = [];
    for (let block = 0; block < 10; block++) {
      const sign = block % 2 === 0 ? 1 : -1;
      for (let i = 0; i < 20; i++) returns.push(sign + (i % 2 === 0 ? 0.1 : -0.1));
    }
    const r = pathRobustnessDiagnostic({ returns, blockCount: 10 });
    expect(r.outOfSampleFailureRate).toBeGreaterThan(0.3);
    expect(r.robustnessScore).toBeLessThan(0.7);
  });

  it("reports the right combination count", () => {
    const r = pathRobustnessDiagnostic({
      returns: strongReturns(200, 1),
      blockCount: 10,
    });
    expect(r.combinations).toBe(252);
  });

  it("sharpeCorrelation is defined and finite", () => {
    const r = pathRobustnessDiagnostic({
      returns: strongReturns(300, 1),
      blockCount: 10,
    });
    expect(Number.isFinite(r.sharpeCorrelation)).toBe(true);
    expect(r.sharpeCorrelation).toBeGreaterThanOrEqual(-1);
    expect(r.sharpeCorrelation).toBeLessThanOrEqual(1);
  });
});