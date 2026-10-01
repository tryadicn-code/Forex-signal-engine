import { describe, expect, it } from "vitest";
import type { OHLCV } from "@/types/market";
import type { SetupResultData, StructureResultData } from "@/types/engine";
import { evaluateTrigger } from "@/core/trigger";
import { bearishTrend } from "../fixtures/candles";

const HOUR = 60 * 60 * 1000;
const BASE = Date.UTC(2024, 0, 1);

function structureWithoutBreaks(
  trend: "LONG" | "SHORT"
): StructureResultData {
  return {
    trend,
    swingHighs: [],
    swingLows: [],
    lastSwingHigh: null,
    lastSwingLow: null,
    lastBOS: null,
    lastCHOCH: null,
    structurePoints: [],
    breakEvents: [],
    trendStrength: 60,
    equalHighs: [],
    equalLows: [],
  };
}

function structureWithBOS(
  index: number,
  direction: "LONG" | "SHORT"
): StructureResultData {
  const event: StructureResultData["breakEvents"][number] = {
    type: "BOS",
    index,
    timestamp: BASE + index * HOUR,
    price: 1.0,
    direction,
    confirmed: true,
    confirmedAtIndex: index,
    confirmedAtTimestamp: BASE + index * HOUR,
  };
  return {
    trend: direction,
    swingHighs: [],
    swingLows: [],
    lastSwingHigh: null,
    lastSwingLow: null,
    lastBOS: event,
    lastCHOCH: null,
    structurePoints: [event],
    breakEvents: [event],
    trendStrength: 60,
    equalHighs: [],
    equalLows: [],
  };
}

function setup(
  opts: { zoneLow: number; zoneHigh: number; invalidationLevel: number }
): SetupResultData {
  return {
    state: "SETUP",
    zoneLow: opts.zoneLow,
    zoneHigh: opts.zoneHigh,
    distanceToZone: 15,
    setupType: "stub",
    setupScore: 50,
    invalidationLevel: opts.invalidationLevel,
    zoneSource: "stub",
  };
}

/** `count` neutral bars, then a bullish engulfing pair that stays outside. */
function seriesWithEngulfing(count = 48): OHLCV[] {
  const out: OHLCV[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      timestamp: BASE + i * HOUR,
      open: 1.0,
      high: 1.0005,
      low: 0.9995,
      close: 1.0,
      volume: 1000,
    });
  }
  out.push({
    timestamp: BASE + count * HOUR,
    open: 1.004,
    high: 1.0045,
    low: 0.9985,
    close: 0.999,
    volume: 1000,
  });
  out.push({
    timestamp: BASE + (count + 1) * HOUR,
    open: 0.9995,
    high: 1.005,
    low: 0.999,
    close: 1.005,
    volume: 1000,
  });
  return out;
}

/** `count` neutral bars, then a pin bar with a large lower rejection wick. */
function seriesWithRejection(count = 49): OHLCV[] {
  const out: OHLCV[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      timestamp: BASE + i * HOUR,
      open: 1.0,
      high: 1.0005,
      low: 0.9995,
      close: 1.0,
      volume: 1000,
    });
  }
  out.push({
    timestamp: BASE + count * HOUR,
    open: 1.0,
    high: 1.002,
    low: 0.99,
    close: 1.001,
    volume: 1000,
  });
  return out;
}

function seriesEndingInsideZone(count = 50): OHLCV[] {
  const out: OHLCV[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      timestamp: BASE + i * HOUR,
      open: 1.0,
      high: 1.0005,
      low: 0.9995,
      close: 1.0,
      volume: 1000,
    });
  }
  return out;
}

function seriesEndingInsideZoneWithVolumeExpansion(count = 50): OHLCV[] {
  const out = seriesEndingInsideZone(count);
  if (out.length > 0) {
    out[out.length - 1] = {
      ...out[out.length - 1],
      volume: 1500,
    };
  }
  return out;
}

describe("evaluateTrigger - momentum alone never confirms", () => {
  it("stays WAITING when momentum aligns but structure and location are absent", () => {
    // A clean downtrend: RSI and MACD both bearish, i.e. momentum genuinely
    // aligned with the SHORT direction.
    const candles = bearishTrend(120);
    const closes = candles.map((c) => c.close);
    const minClose = Math.min(...closes);

    const result = evaluateTrigger(
      candles,
      setup({
        zoneLow: minClose * 0.979,
        zoneHigh: minClose * 0.98,
        invalidationLevel: Math.max(...closes) * 1.01,
      }),
      structureWithoutBreaks("SHORT"),
      "SHORT"
    );

    expect(result.data.breakdown.momentum.aligned).toBe(true);
    expect(result.data.breakdown.structural.fired).toBe(false);
    expect(result.data.breakdown.location.name).toBe("OUTSIDE");
    expect(result.data.state).toBe("WAITING");
  });
});

describe("evaluateTrigger - candle confirmation outside the zone never confirms", () => {
  it("stays WAITING for a rejection wick printed outside the setup zone", () => {
    const result = evaluateTrigger(
      seriesWithRejection(49),
      setup({ zoneLow: 1.02, zoneHigh: 1.021, invalidationLevel: 0.99 }),
      structureWithoutBreaks("LONG"),
      "LONG"
    );
    expect(result.data.breakdown.candle.name).toBe("REJECTION");
    expect(result.data.breakdown.candle.fired).toBe(true);
    expect(result.data.breakdown.location.fired).toBe(false);
    expect(result.data.state).toBe("WAITING");
  });

  it("stays WAITING for an engulfing candle printed outside the setup zone", () => {
    const result = evaluateTrigger(
      seriesWithEngulfing(48),
      setup({ zoneLow: 1.02, zoneHigh: 1.021, invalidationLevel: 0.99 }),
      structureWithoutBreaks("LONG"),
      "LONG"
    );
    expect(result.data.breakdown.candle.name).toBe("ENGULFING");
    expect(result.data.breakdown.candle.fired).toBe(true);
    expect(result.data.breakdown.location.fired).toBe(false);
    expect(result.data.state).toBe("WAITING");
  });
});

describe("evaluateTrigger - structural + location confirmation", () => {
  it("waits when BOS+IN_ZONE has no candle, momentum, or volume confirmation", () => {
    const candles = seriesEndingInsideZone(50);
    const result = evaluateTrigger(
      candles,
      setup({ zoneLow: 0.999, zoneHigh: 1.001, invalidationLevel: 0.995 }),
      structureWithBOS(47, "LONG"),
      "LONG"
    );

    expect(result.data.state).toBe("WAITING");
    expect(result.data.triggerType).toBeNull();
    expect(result.data.breakdown.score).toBe(70);
    expect(result.data.breakdown.volume?.confirmed).toBe(false);
  });

  it("confirms BOS+IN_ZONE when relative volume expands", () => {
    const candles = seriesEndingInsideZoneWithVolumeExpansion(50);
    const result = evaluateTrigger(
      candles,
      setup({ zoneLow: 0.999, zoneHigh: 1.001, invalidationLevel: 0.995 }),
      structureWithBOS(47, "LONG"),
      "LONG"
    );

    expect(result.data.state).toBe("CONFIRMED");
    expect(result.data.triggerType).toBe("BOS+IN_ZONE");
    expect(result.data.triggerIndex).toBe(49);
    expect(result.data.triggerTimestamp).toBe(candles[49].timestamp);
    expect(result.data.ageInBars).toBe(0);
    expect(result.data.breakdown.volume?.confirmed).toBe(true);
    expect(result.data.breakdown.score).toBe(80);
  });
});

describe("evaluateTrigger - trigger freshness", () => {
  it("refuses to fire on a structural event older than the freshness window", () => {
    const candles = seriesEndingInsideZone(50);
    const result = evaluateTrigger(
      candles,
      setup({ zoneLow: 0.999, zoneHigh: 1.001, invalidationLevel: 0.995 }),
      structureWithBOS(5, "LONG"),
      "LONG",
      { trigger: { maxTriggerAgeBars: 3 } }
    );

    expect(result.data.breakdown.structural.name).toBe("BOS");
    expect(result.data.breakdown.structural.fired).toBe(false);
    expect(result.data.state).toBe("WAITING");
  });

  it("fires on the same structural event when it is still fresh", () => {
    const candles = seriesEndingInsideZoneWithVolumeExpansion(50);
    const result = evaluateTrigger(
      candles,
      setup({ zoneLow: 0.999, zoneHigh: 1.001, invalidationLevel: 0.995 }),
      structureWithBOS(47, "LONG"),
      "LONG",
      { trigger: { maxTriggerAgeBars: 3 } }
    );

    expect(result.data.breakdown.structural.fired).toBe(true);
    expect(result.data.breakdown.volume?.confirmed).toBe(true);
    expect(result.data.state).toBe("CONFIRMED");
  });
});