import { describe, expect, it } from "vitest";
import type { OHLCV } from "@/types/market";
import type {
  RegimeResultData,
  SetupResultData,
  StructureResultData,
  SwingPoint,
} from "@/types/engine";
import {
  analyzeRangeMeanReversionSetup,
  evaluateRangeMeanReversionTrigger,
} from "@/core/strategies/range-mean-reversion";

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 2, 0, 0, 0);

function h1Candles(lastClose: number): OHLCV[] {
  const out: OHLCV[] = [];
  for (let i = 0; i < 90; i++) {
    const close = 1.105 + Math.sin((i * 2 * Math.PI) / 10) * 0.0035;
    out.push({
      timestamp: T0 + i * HOUR,
      open: close - 0.00015,
      high: close + 0.0005,
      low: close - 0.0005,
      close,
      volume: 1000,
    });
  }
  const last = out[out.length - 1];
  out[out.length - 1] = {
    ...last,
    open: lastClose - 0.00015,
    high: lastClose + 0.0005,
    low: lastClose - 0.0005,
    close: lastClose,
  };
  return out;
}

function swing(
  index: number,
  price: number,
  kind: "high" | "low"
): SwingPoint {
  return {
    index,
    timestamp: T0 + index * HOUR,
    price,
    kind,
    confirmedAtIndex: index + 3,
    confirmedAtTimestamp: T0 + (index + 3) * HOUR,
  };
}

function rangeStructure(): StructureResultData {
  const swingLows = [
    swing(12, 1.1000, "low"),
    swing(32, 1.1002, "low"),
    swing(52, 1.0999, "low"),
  ];
  const swingHighs = [
    swing(22, 1.1100, "high"),
    swing(42, 1.1098, "high"),
    swing(62, 1.1101, "high"),
  ];
  return {
    trend: "NEUTRAL",
    swingHighs,
    swingLows,
    lastSwingHigh: swingHighs.at(-1)!,
    lastSwingLow: swingLows.at(-1)!,
    lastBOS: null,
    lastCHOCH: null,
    structurePoints: [],
    breakEvents: [],
    trendStrength: 0,
    equalHighs: [],
    equalLows: [],
  };
}

const rangeRegime: RegimeResultData = {
  regime: "RANGE",
  baseRegime: "RANGE",
  direction: "NEUTRAL",
  strength: 20,
  adx: 18,
  ema20: 1.105,
  ema50: 1.105,
  ema200: 1.105,
  atr: 0.001,
  bandWidthRatio: 0.9,
};

function m15Candles(withRejection = true): OHLCV[] {
  const start = T0 + 90 * HOUR;
  const out: OHLCV[] = [];
  for (let i = 0; i < 10; i++) {
    const close = 1.103 + i * 0.00015;
    out.push({
      timestamp: start + i * 15 * 60 * 1000,
      open: close - 0.0001,
      high: close + 0.00035,
      low: close - 0.00035,
      close,
      volume: 1000,
    });
  }

  if (withRejection) {
    out[6] = {
      timestamp: start + 6 * 15 * 60 * 1000,
      open: 1.10035,
      high: 1.1020,
      low: 1.09935,
      close: 1.10155,
      volume: 1500,
    };
    out[7] = {
      timestamp: start + 7 * 15 * 60 * 1000,
      open: 1.1015,
      high: 1.1030,
      low: 1.1013,
      close: 1.1028,
      volume: 1400,
    };
    out[8] = {
      timestamp: start + 8 * 15 * 60 * 1000,
      open: 1.1027,
      high: 1.1041,
      low: 1.1025,
      close: 1.1039,
      volume: 1400,
    };
    out[9] = {
      timestamp: start + 9 * 15 * 60 * 1000,
      open: 1.1038,
      high: 1.1048,
      low: 1.1036,
      close: 1.1046,
      volume: 1400,
    };
  }

  return out;
}

function triggerStructure(
  candles: OHLCV[],
  eventIndex: number
): StructureResultData {
  const event = {
    type: "CHOCH" as const,
    index: eventIndex,
    timestamp: candles[eventIndex].timestamp,
    price: 1.1032,
    direction: "LONG" as const,
    confirmed: true,
    confirmedAtIndex: eventIndex,
    confirmedAtTimestamp: candles[eventIndex].timestamp,
  };
  return {
    trend: "LONG",
    swingHighs: [],
    swingLows: [],
    lastSwingHigh: null,
    lastSwingLow: null,
    lastBOS: null,
    lastCHOCH: event,
    structurePoints: [event],
    breakEvents: [event],
    trendStrength: 60,
    equalHighs: [],
    equalLows: [],
  };
}

describe("Phase 12.4.2 RANGE_MEAN_REVERSION setup", () => {
  it("derives LONG direction from the validated lower range boundary", () => {
    const analysis = analyzeRangeMeanReversionSetup({
      setupCandles: h1Candles(1.1005),
      setupStructure: rangeStructure(),
      regime: rangeRegime,
      pipSize: 0.0001,
    });

    expect(analysis.range?.direction).toBe("LONG");
    expect(analysis.bias.data.direction).toBe("LONG");
    expect(analysis.setup.data.state).toBe("SETUP");
    expect(analysis.setup.data.setupType).toBe("range-mean-reversion");
    expect(analysis.range?.lowerTouches).toBeGreaterThanOrEqual(2);
    expect(analysis.range?.upperTouches).toBeGreaterThanOrEqual(2);
  });

  it("derives SHORT direction from the validated upper range boundary", () => {
    const analysis = analyzeRangeMeanReversionSetup({
      setupCandles: h1Candles(1.1095),
      setupStructure: rangeStructure(),
      regime: rangeRegime,
      pipSize: 0.0001,
    });

    expect(analysis.range?.direction).toBe("SHORT");
    expect(analysis.bias.data.direction).toBe("SHORT");
    expect(analysis.setup.data.state).toBe("SETUP");
  });

  it("waits in the middle of the range instead of manufacturing a trade", () => {
    const analysis = analyzeRangeMeanReversionSetup({
      setupCandles: h1Candles(1.1050),
      setupStructure: rangeStructure(),
      regime: rangeRegime,
      pipSize: 0.0001,
    });

    expect(analysis.range?.direction).toBe("NEUTRAL");
    expect(analysis.bias.data.direction).toBe("NEUTRAL");
    expect(analysis.setup.data.state).toBe("WATCH");
    expect(
      analysis.setup.evidence.some((item) => item.code === "RANGE_MIDPOINT_WAIT")
    ).toBe(true);
  });

  it("invalidates the range after a close beyond the boundary buffer", () => {
    const analysis = analyzeRangeMeanReversionSetup({
      setupCandles: h1Candles(1.1120),
      setupStructure: rangeStructure(),
      regime: rangeRegime,
      pipSize: 0.0001,
    });

    expect(analysis.setup.data.state).toBe("INVALIDATED");
    expect(
      analysis.setup.conflicts.some(
        (item) => item.code === "RANGE_BREAKOUT_DETECTED"
      )
    ).toBe(true);
  });
});

describe("Phase 12.4.2 RANGE_MEAN_REVERSION trigger", () => {
  const setup: SetupResultData = {
    state: "SETUP",
    zoneLow: 1.0990,
    zoneHigh: 1.1010,
    distanceToZone: 5,
    setupType: "range-mean-reversion",
    setupScore: 90,
    invalidationLevel: 1.0992,
    zoneSource: "validated-range-boundary",
  };
  const range = {
    lowerBoundary: 1.1000,
    upperBoundary: 1.1100,
    midpoint: 1.1050,
    width: 0.01,
    widthPips: 100,
    widthAtr: 10,
    lowerTouches: 3,
    upperTouches: 3,
    direction: "LONG" as const,
    zoneLow: 1.0990,
    zoneHigh: 1.1010,
  };

  it("confirms only after boundary rejection and post-rejection structure", () => {
    const candles = m15Candles(true);
    const trigger = evaluateRangeMeanReversionTrigger({
      candles,
      setup,
      range,
      structure: triggerStructure(candles, 8),
      direction: "LONG",
    });

    expect(trigger.data.breakdown.location.fired).toBe(true);
    expect(trigger.data.breakdown.candle.fired).toBe(true);
    expect(trigger.data.breakdown.structural.name).toBe("CHOCH");
    expect(trigger.data.state).toBe("CONFIRMED");
    expect(trigger.data.triggerType).toContain("RANGE_REJECTION");
  });

  it("stays WAITING when price never rejects the active boundary", () => {
    const candles = m15Candles(false);
    const trigger = evaluateRangeMeanReversionTrigger({
      candles,
      setup,
      range,
      structure: triggerStructure(candles, 8),
      direction: "LONG",
    });

    expect(trigger.data.state).toBe("WAITING");
    expect(
      trigger.conflicts.some(
        (item) => item.code === "RANGE_BOUNDARY_REJECTION_MISSING"
      )
    ).toBe(true);
  });

  it("does not reuse structure that occurred before the boundary rejection", () => {
    const candles = m15Candles(true);
    const trigger = evaluateRangeMeanReversionTrigger({
      candles,
      setup,
      range,
      structure: triggerStructure(candles, 4),
      direction: "LONG",
    });

    expect(trigger.data.state).toBe("WAITING");
    expect(
      trigger.conflicts.some(
        (item) => item.code === "RANGE_STRUCTURE_TURN_MISSING"
      )
    ).toBe(true);
  });
});
