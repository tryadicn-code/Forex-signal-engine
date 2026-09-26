import { describe, expect, it } from "vitest";
import type { OHLCV } from "@/types/market";
import type { BiasResultData, StructureResultData } from "@/types/engine";
import { analyzeSetup } from "@/core/setup";
import { bearishTrend, bullishTrend } from "../fixtures/candles";

const HOUR = 60 * 60 * 1000;
const BASE = Date.UTC(2024, 0, 1);
const P = 1.0;

function longBias(score = 60): BiasResultData {
  return {
    direction: "LONG",
    label: "LONG",
    score,
    components: {} as never,
    weights: {} as never,
  };
}

function shortBias(score = 60): BiasResultData {
  return {
    direction: "SHORT",
    label: "SHORT",
    score: -score,
    components: {} as never,
    weights: {} as never,
  };
}

/**
 * Rising series that ends with a pullback whose close lands exactly on `P`.
 * The EMA stack stays above the final close, so the EMA dynamic zone is on the
 * wrong side of price and the crafted support zone is the only one selected.
 */
function risingIntoPullback(count = 60): OHLCV[] {
  const out: OHLCV[] = [];
  const start = P * 0.95;
  const top = P * 1.06;
  for (let i = 0; i < count - 1; i++) {
    const close = start + (top - start) * (i / (count - 2));
    const open = close - P * 0.0005;
    out.push({
      timestamp: BASE + i * HOUR,
      open,
      high: Math.max(open, close) + 0.0004,
      low: Math.min(open, close) - 0.0004,
      close,
      volume: 1000,
    });
  }
  out.push({
    timestamp: BASE + (count - 1) * HOUR,
    open: P * 1.001,
    high: P * 1.0014,
    low: P * 0.9986,
    close: P,
    volume: 1500,
  });
  return out;
}

function fallingIntoPullback(count = 60): OHLCV[] {
  const out: OHLCV[] = [];
  const start = P * 1.05;
  const bottom = P * 0.94;
  for (let i = 0; i < count - 1; i++) {
    const close = start - (start - bottom) * (i / (count - 2));
    const open = close + P * 0.0005;
    out.push({
      timestamp: BASE + i * HOUR,
      open,
      high: Math.max(open, close) + 0.0004,
      low: Math.min(open, close) - 0.0004,
      close,
      volume: 1000,
    });
  }
  out.push({
    timestamp: BASE + (count - 1) * HOUR,
    open: P * 0.999,
    high: P * 1.0014,
    low: P * 0.9986,
    close: P,
    volume: 1500,
  });
  return out;
}

function stubStructure(opts: {
  swingLowPrice?: number;
  swingHighPrice?: number;
  trend?: "LONG" | "SHORT";
}): StructureResultData {
  const trend = opts.trend ?? "LONG";
  const lowPrice = opts.swingLowPrice ?? P;
  const highPrice = opts.swingHighPrice ?? P * 1.05;
  return {
    trend,
    swingHighs: [
      {
        index: 20,
        timestamp: BASE + 20 * HOUR,
        price: highPrice,
        kind: "high",
        confirmedAtIndex: 23,
        confirmedAtTimestamp: BASE + 23 * HOUR,
      },
    ],
    swingLows: [
      {
        index: 40,
        timestamp: BASE + 40 * HOUR,
        price: lowPrice,
        kind: "low",
        confirmedAtIndex: 43,
        confirmedAtTimestamp: BASE + 43 * HOUR,
      },
    ],
    lastSwingHigh: {
      index: 20,
      timestamp: BASE + 20 * HOUR,
      price: highPrice,
      kind: "high",
      confirmedAtIndex: 23,
      confirmedAtTimestamp: BASE + 23 * HOUR,
    },
    lastSwingLow: {
      index: 40,
      timestamp: BASE + 40 * HOUR,
      price: lowPrice,
      kind: "low",
      confirmedAtIndex: 43,
      confirmedAtTimestamp: BASE + 43 * HOUR,
    },
    lastBOS: null,
    lastCHOCH: null,
    structurePoints: [],
    breakEvents: [],
    trendStrength: 60,
    equalHighs: [],
    equalLows: [],
  };
}

function crashBelow(candles: OHLCV[], bars = 12): OHLCV[] {
  const out = [...candles];
  const start = out[out.length - 1].close;
  for (let i = 0; i < bars; i++) {
    const close = start * Math.pow(0.995, i + 1);
    out.push({
      timestamp: out[out.length - 1].timestamp + HOUR,
      open: close * 1.001,
      high: close * 1.0015,
      low: close * 0.9985,
      close,
      volume: 1000,
    });
  }
  return out;
}

function rallyAbove(candles: OHLCV[], bars = 12): OHLCV[] {
  const out = [...candles];
  const start = out[out.length - 1].close;
  for (let i = 0; i < bars; i++) {
    const close = start * Math.pow(1.005, i + 1);
    out.push({
      timestamp: out[out.length - 1].timestamp + HOUR,
      open: close * 0.999,
      high: close * 1.0015,
      low: close * 0.9985,
      close,
      volume: 1000,
    });
  }
  return out;
}

describe("analyzeSetup - wrong-side zone rejection", () => {
  it("drops every zone below price for a LONG instead of clamping distance to zero", () => {
    const crashed = crashBelow(bullishTrend(100));
    const result = analyzeSetup(
      crashed,
      longBias(),
      stubStructure({ trend: "LONG", swingLowPrice: crashed[0].close * 1.1 })
    );
    expect(result.data.state).toBe("NONE");
    expect(result.evidence.map((e) => e.code)).toContain("NO_ZONE_ON_SIDE");
  });

  it("drops every zone above price for a SHORT instead of clamping distance to zero", () => {
    const rallied = rallyAbove(bearishTrend(100));
    const result = analyzeSetup(
      rallied,
      shortBias(),
      stubStructure({ trend: "SHORT", swingHighPrice: rallied[0].close * 0.9 })
    );
    expect(result.data.state).toBe("NONE");
    expect(result.evidence.map((e) => e.code)).toContain("NO_ZONE_ON_SIDE");
  });

  it("never reports a negative distance for a LONG setup", () => {
    for (const candles of [
      bullishTrend(120),
      bearishTrend(120),
      crashBelow(bullishTrend(80)),
    ]) {
      const result = analyzeSetup(
        candles,
        longBias(),
        stubStructure({ trend: "LONG" })
      );
      expect(result.data.distanceToZone).toBeGreaterThanOrEqual(0);
    }
  });

  it("never reports a negative distance for a SHORT setup", () => {
    for (const candles of [
      bullishTrend(120),
      bearishTrend(120),
      rallyAbove(bearishTrend(80)),
    ]) {
      const result = analyzeSetup(
        candles,
        shortBias(),
        stubStructure({ trend: "SHORT" })
      );
      expect(result.data.distanceToZone).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("analyzeSetup - price inside the zone", () => {
  it("accepts a LONG setup when the close sits inside the zone", () => {
    const candles = risingIntoPullback(60);
    const result = analyzeSetup(
      candles,
      longBias(),
      stubStructure({ trend: "LONG", swingLowPrice: P }),
      0.0001,
      { setup: { armThresholdRatio: 0 } }
    );
    expect(result.data.state).toBe("SETUP");
    expect(result.evidence.map((e) => e.code)).toContain("PRICE_IN_ZONE");
  });

  it("arms the setup when the close is at the entry edge of the zone", () => {
    const candles = risingIntoPullback(60);
    const result = analyzeSetup(
      candles,
      longBias(),
      stubStructure({ trend: "LONG", swingLowPrice: P }),
      0.0001,
      { setup: { armThresholdRatio: 1 } }
    );
    expect(result.data.state).toBe("ARMED");
  });

  it("accepts a SHORT setup when the close sits inside the zone", () => {
    const candles = fallingIntoPullback(60);
    const result = analyzeSetup(
      candles,
      shortBias(),
      stubStructure({ trend: "SHORT", swingHighPrice: P }),
      0.0001,
      { setup: { armThresholdRatio: 0 } }
    );
    expect(result.data.state).toBe("SETUP");
    expect(result.evidence.map((e) => e.code)).toContain("PRICE_IN_ZONE");
  });
});

describe("analyzeSetup - minimum quality applies to SETUP and ARMED", () => {
  it("downgrades an armed setup below the minimum quality threshold", () => {
    const candles = risingIntoPullback(60);
    const structure = stubStructure({ trend: "LONG", swingLowPrice: P });
    const armed = analyzeSetup(candles, longBias(), structure, 0.0001, {
      setup: { armThresholdRatio: 1 },
    });
    expect(armed.data.state).toBe("ARMED");

    const downgraded = analyzeSetup(candles, longBias(), structure, 0.0001, {
      setup: { armThresholdRatio: 1, minSetupScore: armed.data.setupScore + 1 },
    });
    expect(downgraded.data.state).toBe("WATCH");
    expect(downgraded.evidence.map((e) => e.code)).toContain("SCORE_TOO_LOW");
  });

  it("downgrades a scored setup below the minimum quality threshold", () => {
    const candles = risingIntoPullback(60);
    const structure = stubStructure({ trend: "LONG", swingLowPrice: P });
    const setup = analyzeSetup(candles, longBias(), structure, 0.0001, {
      setup: { armThresholdRatio: 0 },
    });
    expect(setup.data.state).toBe("SETUP");

    const downgraded = analyzeSetup(candles, longBias(), structure, 0.0001, {
      setup: { armThresholdRatio: 0, minSetupScore: setup.data.setupScore + 1 },
    });
    expect(downgraded.data.state).toBe("WATCH");
  });
});