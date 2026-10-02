import { describe, expect, it } from "vitest";
import type { OHLCV } from "@/types/market";
import type {
  BiasResultData,
  RegimeResultData,
  SetupResultData,
  StructureResultData,
} from "@/types/engine";
import {
  analyzeBreakoutRetestSetup,
  evaluateBreakoutRetestTrigger,
} from "@/core/strategies/breakout-retest";

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 0, 0, 0);

function setupCandles(): OHLCV[] {
  const out: OHLCV[] = [];
  for (let i = 0; i < 30; i++) {
    let close =
      i < 20
        ? 1.095 + i * 0.00015
        : 1.1002 + (i - 20) * 0.00012;
    if (i === 20) close = 1.1002;
    const open = close - 0.0002;
    out.push({
      timestamp: T0 + i * HOUR,
      open,
      high: close + 0.0004,
      low: open - 0.0004,
      close,
      volume: 1000 + i * 10,
    });
  }
  return out;
}

function triggerCandles(withRetest = true): OHLCV[] {
  const start = T0 + 20 * HOUR + 15 * 60 * 1000;
  const out: OHLCV[] = [];
  for (let i = 0; i < 10; i++) {
    const close = 1.1015 + i * 0.00008;
    out.push({
      timestamp: start + i * 15 * 60 * 1000,
      open: close - 0.0001,
      high: close + 0.00025,
      low: close - 0.00025,
      close,
      volume: 1000,
    });
  }

  if (withRetest) {
    out[6] = {
      timestamp: start + 6 * 15 * 60 * 1000,
      open: 1.09855,
      high: 1.0998,
      low: 1.0978,
      close: 1.09965,
      volume: 1600,
    };
    out[7] = {
      timestamp: start + 7 * 15 * 60 * 1000,
      open: 1.0996,
      high: 1.1015,
      low: 1.0994,
      close: 1.1012,
      volume: 1800,
    };
    out[8] = {
      timestamp: start + 8 * 15 * 60 * 1000,
      open: 1.1011,
      high: 1.1023,
      low: 1.1009,
      close: 1.1021,
      volume: 1800,
    };
    out[9] = {
      timestamp: start + 9 * 15 * 60 * 1000,
      open: 1.1020,
      high: 1.1028,
      low: 1.1018,
      close: 1.1026,
      volume: 1800,
    };
  }

  return out;
}

function breakoutStructure(eventIndex = 20): StructureResultData {
  const eventTimestamp = T0 + eventIndex * HOUR;
  const event = {
    type: "BOS" as const,
    index: eventIndex,
    timestamp: eventTimestamp,
    price: 1.098,
    direction: "LONG" as const,
    confirmed: true,
    confirmedAtIndex: eventIndex,
    confirmedAtTimestamp: eventTimestamp,
  };
  return {
    trend: "LONG",
    swingHighs: [],
    swingLows: [],
    lastSwingHigh: null,
    lastSwingLow: null,
    lastBOS: event,
    lastCHOCH: null,
    structurePoints: [event],
    breakEvents: [event],
    trendStrength: 80,
    equalHighs: [],
    equalLows: [],
  };
}

function triggerStructure(
  candles: OHLCV[],
  eventIndex = 8
): StructureResultData {
  const event = {
    type: "BOS" as const,
    index: eventIndex,
    timestamp: candles[eventIndex].timestamp,
    price: 1.1014,
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
    lastBOS: event,
    lastCHOCH: null,
    structurePoints: [event],
    breakEvents: [event],
    trendStrength: 80,
    equalHighs: [],
    equalLows: [],
  };
}

const breakoutRegime: RegimeResultData = {
  regime: "BREAKOUT",
  baseRegime: "BREAKOUT",
  direction: "NEUTRAL",
  strength: 72,
  adx: 35,
  ema20: 1.1,
  ema50: 1.09,
  ema200: 1.08,
  atr: 0.001,
  bandWidthRatio: 1.8,
};

const longBias: BiasResultData = {
  label: "LONG",
  direction: "LONG",
  score: 55,
  components: {
    structure: 70,
    trend: 70,
    regime: 0,
    momentum: 35,
  },
  weights: {
    structure: 35,
    trend: 25,
    regime: 20,
    momentum: 20,
  },
};

describe("Phase 12.4.1 BREAKOUT_RETEST setup", () => {
  it("arms only after price retests and holds the confirmed broken level", () => {
    const setup = analyzeBreakoutRetestSetup({
      setupCandles: setupCandles(),
      triggerCandles: triggerCandles(true),
      setupStructure: breakoutStructure(),
      regime: breakoutRegime,
      bias: longBias,
      pipSize: 0.0001,
      marketAsOf: triggerCandles(true).at(-1)!.timestamp,
    });

    expect(setup.breakout).not.toBeNull();
    expect(setup.result.data.setupType).toBe("breakout-retest");
    expect(setup.result.data.zoneSource).toBe("broken-structure-level");
    expect(setup.result.data.state).toBe("ARMED");
    expect(setup.retestTimestamp).not.toBeNull();
    expect(
      setup.result.evidence.some((item) => item.code === "BREAKOUT_RETEST_HELD")
    ).toBe(true);
  });

  it("does not chase an extended breakout that has never retested", () => {
    const candles = triggerCandles(false).map((c) => ({
      ...c,
      open: c.open + 0.01,
      high: c.high + 0.01,
      low: c.low + 0.01,
      close: c.close + 0.01,
    }));

    const setup = analyzeBreakoutRetestSetup({
      setupCandles: setupCandles(),
      triggerCandles: candles,
      setupStructure: breakoutStructure(),
      regime: breakoutRegime,
      bias: longBias,
      pipSize: 0.0001,
      marketAsOf: candles.at(-1)!.timestamp,
    });

    expect(setup.result.data.state).toBe("WATCH");
    expect(
      setup.result.evidence.some((item) => item.code === "BREAKOUT_NO_CHASE")
    ).toBe(true);
  });

  it("refuses to create a breakout setup outside BREAKOUT regime", () => {
    const setup = analyzeBreakoutRetestSetup({
      setupCandles: setupCandles(),
      triggerCandles: triggerCandles(true),
      setupStructure: breakoutStructure(),
      regime: { ...breakoutRegime, regime: "TREND_UP", baseRegime: "TREND_UP" },
      bias: longBias,
      pipSize: 0.0001,
    });

    expect(setup.result.data.state).toBe("NONE");
    expect(
      setup.result.evidence.some(
        (item) => item.code === "BREAKOUT_REGIME_REQUIRED"
      )
    ).toBe(true);
  });
});

describe("Phase 12.4.1 BREAKOUT_RETEST trigger", () => {
  const setup: SetupResultData = {
    state: "ARMED",
    zoneLow: 1.0972,
    zoneHigh: 1.0988,
    distanceToZone: 0,
    setupType: "breakout-retest",
    setupScore: 85,
    invalidationLevel: 1.0964,
    zoneSource: "broken-structure-level",
  };

  const breakout = {
    direction: "LONG" as const,
    eventType: "BOS" as const,
    level: 1.098,
    eventIndex: 20,
    eventTimestamp: T0 + 20 * HOUR,
    ageInBars: 9,
    breakDistanceAtr: 1.2,
  };

  it("confirms only after retest-hold and post-retest structural resumption", () => {
    const candles = triggerCandles(true);
    const trigger = evaluateBreakoutRetestTrigger({
      candles,
      setup,
      structure: triggerStructure(candles, 8),
      direction: "LONG",
      breakout,
      marketAsOf: candles.at(-1)!.timestamp,
    });

    expect(trigger.data.breakdown.location.name).toBe("RETEST_HOLD");
    expect(trigger.data.breakdown.structural.name).toBe("BOS");
    expect(trigger.data.state).toBe("CONFIRMED");
    expect(trigger.data.triggerType).toContain("BREAKOUT_RETEST");
  });

  it("stays WAITING when there is no retest, even with bullish structure", () => {
    const candles = triggerCandles(false);
    const trigger = evaluateBreakoutRetestTrigger({
      candles,
      setup,
      structure: triggerStructure(candles, 8),
      direction: "LONG",
      breakout,
    });

    expect(trigger.data.state).toBe("WAITING");
    expect(
      trigger.conflicts.some(
        (item) => item.code === "BREAKOUT_RETEST_NOT_HELD"
      )
    ).toBe(true);
  });

  it("does not recycle a structural break that happened before the retest", () => {
    const candles = triggerCandles(true);
    const structure = triggerStructure(candles, 4);
    const trigger = evaluateBreakoutRetestTrigger({
      candles,
      setup,
      structure,
      direction: "LONG",
      breakout,
    });

    expect(trigger.data.state).toBe("WAITING");
    expect(
      trigger.conflicts.some(
        (item) => item.code === "BREAKOUT_RESUMPTION_MISSING"
      )
    ).toBe(true);
  });
});
