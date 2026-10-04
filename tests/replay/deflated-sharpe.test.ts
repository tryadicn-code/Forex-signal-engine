import { describe, expect, it } from "vitest";
import {
  deflatedSharpe,
  perObservationSharpe,
  sampleSkewness,
  sampleKurtosis,
} from "@/replay/deflated-sharpe";

describe("sample moments", () => {
  it("skewness of symmetric input is near zero", () => {
    expect(Math.abs(sampleSkewness([-2, -1, 0, 1, 2]))).toBeLessThan(1e-12);
  });

  it("kurtosis of a short sample falls back to 3", () => {
    expect(sampleKurtosis([1, 2])).toBe(3);
  });

  it("per-observation Sharpe of constant returns is 0", () => {
    expect(perObservationSharpe([1, 1, 1, 1])).toBe(0);
  });
});

describe("deflatedSharpe", () => {
  const returns = [
    2, -1, 1.5, -0.5, 2, -1, 1.5, -0.5, 2, -1,
    1.5, -0.5, 2, -1, 1.5, -0.5, 2, -1, 1.5, -0.5,
  ];

  it("with one trial and no skew, DSR reduces to normalCdf(SR * sqrt(T-1))", () => {
    const r = deflatedSharpe({ returns, numberOfTrials: 1 });
    expect(r.expectedMaxSharpe).toBe(0);
    expect(r.deflatedSharpe).toBeGreaterThan(0);
    expect(r.deflatedSharpe).toBeLessThan(1);
  });

  it("more trials lowers the deflated Sharpe", () => {
    const oneTrial = deflatedSharpe({ returns, numberOfTrials: 1 });
    const manyTrials = deflatedSharpe({ returns, numberOfTrials: 1000 });
    expect(manyTrials.deflatedSharpe).toBeLessThan(oneTrial.deflatedSharpe);
  });

  it("higher variance of trials lowers the deflated Sharpe", () => {
    const small = deflatedSharpe({
      returns,
      numberOfTrials: 100,
      sharpeVariance: 0.001,
    });
    const large = deflatedSharpe({
      returns,
      numberOfTrials: 100,
      sharpeVariance: 1,
    });
    expect(large.deflatedSharpe).toBeLessThan(small.deflatedSharpe);
  });

  it("uses estimated variance when sharpeVariance is omitted", () => {
    const r = deflatedSharpe({ returns, numberOfTrials: 10 });
    expect(r.usesEstimatedVariance).toBe(true);
    expect(r.sharpeVariance).toBeCloseTo(1 / (returns.length - 1), 12);
  });

  it("rejects fewer than 4 observations", () => {
    expect(() =>
      deflatedSharpe({ returns: [1, -1, 1], numberOfTrials: 1 })
    ).toThrow(/at least 4/);
  });

  it("rejects non-integer trial counts", () => {
    expect(() =>
      deflatedSharpe({ returns, numberOfTrials: 2.5 })
    ).toThrow(/positive integer/);
  });

  it("rejects non-finite returns", () => {
    expect(() =>
      deflatedSharpe({
        returns: [1, 2, NaN, 4],
        numberOfTrials: 1,
      })
    ).toThrow(/finite/);
  });

  it("probabilityTrueSharpePositive equals deflatedSharpe", () => {
    const r = deflatedSharpe({ returns, numberOfTrials: 50 });
    expect(r.probabilityTrueSharpePositive).toBe(r.deflatedSharpe);
  });

  it("a strong strategy clears the recommended 0.95 threshold", () => {
    // Stronger returns: mostly wins with small losses.
    const strong = Array.from({ length: 100 }, (_, i) =>
      i % 5 === 0 ? -0.5 : 1.2
    );
    const r = deflatedSharpe({ returns: strong, numberOfTrials: 100 });
    expect(r.deflatedSharpe).toBeGreaterThan(0.95);
  });

  it("a noise strategy fails the 0.95 threshold after many trials", () => {
    // Symmetric returns centered at zero.
    const noise = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0 ? 1 : -1
    );
    const r = deflatedSharpe({ returns: noise, numberOfTrials: 1000 });
    expect(r.deflatedSharpe).toBeLessThan(0.95);
  });
});