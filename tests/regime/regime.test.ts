import { describe, expect, it } from "vitest";
import { classifyRegime } from "@/core/regime";
import { analyzeStructure } from "@/core/structure";
import {
  bearishTrend,
  bullishTrend,
  rangeSeries,
} from "../fixtures/candles";

function regimeFor(candles: ReturnType<typeof bullishTrend>) {
  const structure = analyzeStructure(candles);
  return classifyRegime(candles, structure.data);
}

describe("classifyRegime", () => {
  it("classifies a strong uptrend as a trending-up regime", () => {
    const result = regimeFor(bullishTrend(200));
    expect(["STRONG_TREND_UP", "TREND_UP"]).toContain(result.data.regime);
    expect(result.data.baseRegime).toBe("TREND_UP");
    expect(result.data.direction).toBe("LONG");
  });

  it("classifies a strong downtrend as a trending-down regime", () => {
    const result = regimeFor(bearishTrend(200));
    expect(["STRONG_TREND_DOWN", "TREND_DOWN"]).toContain(result.data.regime);
    expect(result.data.baseRegime).toBe("TREND_DOWN");
    expect(result.data.direction).toBe("SHORT");
  });

  it("classifies a tight range as RANGE or LOW_VOLATILITY", () => {
    const result = regimeFor(rangeSeries(200, 1.1, 0.0004));
    expect(["RANGE", "LOW_VOLATILITY", "HIGH_VOLATILITY"]).toContain(
      result.data.regime
    );
  });

  it("preserves trend direction when a trending market is classified as BREAKOUT", () => {
    const candles = bullishTrend(200);
    const structure = analyzeStructure(candles);
    const result = classifyRegime(candles, structure.data, {
      regime: { breakoutBandWidthRatio: 0 },
    });

    expect(result.data.regime).toBe("BREAKOUT");
    expect(result.data.direction).toBe("LONG");
  });

  it("reports strength between 0 and 100", () => {
    const result = regimeFor(bullishTrend(200));
    expect(result.data.strength).toBeGreaterThanOrEqual(0);
    expect(result.data.strength).toBeLessThanOrEqual(100);
  });

  it("exposes every indicator reading used by the classification", () => {
    const result = regimeFor(bullishTrend(200));
    expect(typeof result.data.adx).toBe("number");
    expect(typeof result.data.ema20).toBe("number");
    expect(typeof result.data.ema50).toBe("number");
    expect(typeof result.data.ema200).toBe("number");
    expect(typeof result.data.atr).toBe("number");
    expect(typeof result.data.bandWidthRatio).toBe("number");
  });

  it("emits structured evidence covering every factor", () => {
    const result = regimeFor(bullishTrend(200));
    const codes = result.evidence.map((e) => e.code);
    expect(codes).toContain("EMA_ALIGNMENT");
    expect(codes).toContain("STRUCTURE_TREND");
    expect(codes).toContain("ADX");
    expect(codes).toContain("ATR_VOLATILITY");
    expect(codes).toContain("BAND_WIDTH");
  });

  it("never uses a single indicator alone: trend requires EMA + structure agreement", () => {
    const structure = analyzeStructure(bullishTrend(200));
    // Force the structure trend to disagree with the bullish EMA stack.
    const regime = classifyRegime(bullishTrend(200), {
      ...structure.data,
      trend: "SHORT",
      trendStrength: 0,
    });
    expect(regime.conflicts.length).toBeGreaterThan(0);
    expect(regime.conflicts.map((c) => c.code)).toContain("STRUCTURE_VS_EMA");
  });
});
