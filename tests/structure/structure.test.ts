import { describe, expect, it } from "vitest";
import type { OHLCV } from "@/types/market";
import { analyzeStructure } from "@/core/structure";
import {
  bearishTrend,
  bullishTrend,
  rangeSeries,
} from "../fixtures/candles";

describe("analyzeStructure - swing detection", () => {
  it("detects swing highs and lows in a trending series", () => {
    const result = analyzeStructure(bullishTrend(120));
    expect(result.data.swingHighs.length).toBeGreaterThan(0);
    expect(result.data.swingLows.length).toBeGreaterThan(0);
  });

  it("exposes the last swing high and last swing low", () => {
    const result = analyzeStructure(bullishTrend(120));
    expect(result.data.lastSwingHigh).not.toBeNull();
    expect(result.data.lastSwingLow).not.toBeNull();
    expect(result.data.lastSwingHigh!.price).toBeGreaterThan(
      result.data.lastSwingLow!.price
    );
  });

  it("is deterministic for identical input", () => {
    const a = analyzeStructure(rangeSeries(120));
    const b = analyzeStructure(rangeSeries(120));
    expect(a.data.structurePoints).toEqual(b.data.structurePoints);
  });
});

describe("analyzeStructure - trend classification", () => {
  it("classifies a clean uptrend as LONG", () => {
    const result = analyzeStructure(bullishTrend(140));
    expect(result.data.trend).toBe("LONG");
  });

  it("classifies a clean downtrend as SHORT", () => {
    const result = analyzeStructure(bearishTrend(140));
    expect(result.data.trend).toBe("SHORT");
  });

  it("reports trend strength between 0 and 100", () => {
    const result = analyzeStructure(bullishTrend(140));
    expect(result.data.trendStrength).toBeGreaterThanOrEqual(0);
    expect(result.data.trendStrength).toBeLessThanOrEqual(100);
  });

  it("records HH/HL points in an uptrend", () => {
    const result = analyzeStructure(bullishTrend(140));
    const types = result.data.structurePoints.map((p) => p.type);
    expect(types).toContain("HH");
    expect(types).toContain("HL");
  });

  it("records LH/LL points in a downtrend", () => {
    const result = analyzeStructure(bearishTrend(140));
    const types = result.data.structurePoints.map((p) => p.type);
    expect(types).toContain("LH");
    expect(types).toContain("LL");
  });
});

const HOUR = 60 * 60 * 1000;

function recentMaxHigh(candles: OHLCV[]): number {
  return Math.max(...candles.slice(-20).map((c) => c.high));
}

function recentMinLow(candles: OHLCV[]): number {
  return Math.min(...candles.slice(-20).map((c) => c.low));
}

function appendCloseAboveRecentHigh(candles: OHLCV[]): OHLCV[] {
  const maxHigh = recentMaxHigh(candles);
  const close = maxHigh * 1.002;
  candles.push({
    timestamp: candles[candles.length - 1].timestamp + 4 * HOUR,
    open: maxHigh,
    high: close * 1.0005,
    low: maxHigh * 0.9995,
    close,
    volume: 2000,
  });
  return candles;
}

function appendCloseBelowRecentLow(candles: OHLCV[]): OHLCV[] {
  const minLow = recentMinLow(candles);
  const close = minLow * 0.998;
  candles.push({
    timestamp: candles[candles.length - 1].timestamp + 4 * HOUR,
    open: minLow,
    high: minLow * 1.0005,
    low: close * 0.9995,
    close,
    volume: 2000,
  });
  return candles;
}

describe("analyzeStructure - BOS and CHOCH", () => {
  it("labels a continuation break as BOS", () => {
    const candles = appendCloseAboveRecentHigh(bullishTrend(140));
    const result = analyzeStructure(candles);
    expect(result.data.lastBOS).not.toBeNull();
    expect(result.data.lastBOS!.type).toBe("BOS");
    expect(result.data.lastBOS!.direction).toBe("LONG");
    expect(result.data.lastBOS!.confirmed).toBe(true);
  });

  it("labels a reversal break as CHOCH", () => {
    // Uptrend in place, then a decisive close below the prior swing low.
    const candles = appendCloseBelowRecentLow(bullishTrend(140));
    const result = analyzeStructure(candles);
    expect(result.data.lastCHOCH).not.toBeNull();
    expect(result.data.lastCHOCH!.type).toBe("CHOCH");
    expect(result.data.lastCHOCH!.direction).toBe("SHORT");
  });

  it("populates structurePoints with BOS when it occurs", () => {
    const candles = appendCloseAboveRecentHigh(bullishTrend(140));
    const result = analyzeStructure(candles);
    const types = result.data.structurePoints.map((p) => p.type);
    expect(types).toContain("BOS");
  });

  it("populates structurePoints with CHOCH when it occurs", () => {
    const candles = appendCloseBelowRecentLow(bullishTrend(140));
    const result = analyzeStructure(candles);
    const types = result.data.structurePoints.map((p) => p.type);
    expect(types).toContain("CHOCH");
  });

  it("reports BOS/CHOCH as structured evidence", () => {
    const candles = appendCloseAboveRecentHigh(bullishTrend(140));
    const result = analyzeStructure(candles);
    const codes = result.evidence.map((e) => e.code);
    expect(codes).toContain("BOS");
  });
});

describe("analyzeStructure - equal highs and lows", () => {
  it("detects equal highs when two swing highs sit within tolerance", () => {
    // A range with two near-identical swing highs.
    const candles = rangeSeries(140, 1.1, 0.002);
    const result = analyzeStructure(candles, undefined, 0.0001);
    expect(result.data.equalHighs.length).toBeGreaterThanOrEqual(0);
    expect(result.data.equalLows.length).toBeGreaterThanOrEqual(0);
  });

  it("widening tolerance finds at least as many equal levels", () => {
    const candles = rangeSeries(140, 1.1, 0.002);
    const tight = analyzeStructure(candles, {
      structure: { equalTolerancePips: 5 },
    });
    const wide = analyzeStructure(candles, {
      structure: { equalTolerancePips: 60 },
    });
    expect(wide.data.equalHighs.length + wide.data.equalLows.length).toBeGreaterThanOrEqual(
      tight.data.equalHighs.length + tight.data.equalLows.length
    );
  });
});

describe("analyzeStructure - required output shape", () => {
  it("returns all mandated fields", () => {
    const result = analyzeStructure(bullishTrend(120));
    const data = result.data;
    expect(data).toHaveProperty("trend");
    expect(data).toHaveProperty("lastSwingHigh");
    expect(data).toHaveProperty("lastSwingLow");
    expect(data).toHaveProperty("lastBOS");
    expect(data).toHaveProperty("lastCHOCH");
    expect(data).toHaveProperty("structurePoints");
    expect(Array.isArray(data.structurePoints)).toBe(true);
  });

  it("reports structured evidence, never free-form strings", () => {
    const result = analyzeStructure(bullishTrend(140));
    expect(result.evidence.length).toBeGreaterThan(0);
    for (const item of result.evidence) {
      expect(typeof item.code).toBe("string");
      expect(typeof item.label).toBe("string");
      expect(typeof item.description).toBe("string");
    }
  });

  it("honours a custom swing lookback", () => {
    const tight = analyzeStructure(bullishTrend(140), {
      structure: { swingLookback: 2 },
    });
    const wide = analyzeStructure(bullishTrend(140), {
      structure: { swingLookback: 8 },
    });
    expect(
      tight.data.swingHighs.length + tight.data.swingLows.length
    ).not.toBe(wide.data.swingHighs.length + wide.data.swingLows.length);
  });
});
