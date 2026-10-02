import { describe, expect, it } from "vitest";
import type { OHLCV } from "@/types/market";
import type {
  RegimeResultData,
  SetupResultData,
  StructureResultData,
  SwingPoint,
} from "@/types/engine";
import {
  analyzeReversalSetup,
  evaluateReversalTrigger,
  qualifyReversal,
  type ReversalQualification,
} from "@/core/strategies/reversal";

const HOUR = 60 * 60 * 1000;
const H4 = 4 * HOUR;
const T0 = Date.UTC(2026, 9, 2, 0, 0, 0);

function h4Candles(): OHLCV[] {
  const out: OHLCV[] = [];
  for (let i = 0; i < 40; i++) {
    const close = 1.105 + Math.sin(i / 2) * 0.0015;
    out.push({
      timestamp: T0 + i * H4,
      open: close + 0.0002,
      high: close + 0.0010,
      low: close - 0.0010,
      close,
      volume: 1000,
    });
  }
  out[30] = {
    timestamp: T0 + 30 * H4,
    open: 1.1104,
    high: 1.1122,
    low: 1.1082,
    close: 1.1090,
    volume: 1800,
  };
  out[34] = {
    timestamp: T0 + 34 * H4,
    open: 1.1000,
    high: 1.1005,
    low: 1.0965,
    close: 1.0970,
    volume: 1900,
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
    timestamp: T0 + index * H4,
    price,
    kind,
    confirmedAtIndex: index + 3,
    confirmedAtTimestamp: T0 + (index + 3) * H4,
  };
}

function reversalStructure(withChoch = true): StructureResultData {
  const high = swing(25, 1.1100, "high");
  const low = swing(29, 1.0980, "low");
  const choch = {
    type: "CHOCH" as const,
    index: 34,
    timestamp: T0 + 34 * H4,
    price: 1.0980,
    direction: "SHORT" as const,
    confirmed: true,
    confirmedAtIndex: 34,
    confirmedAtTimestamp: T0 + 34 * H4,
  };
  return {
    trend: "NEUTRAL",
    swingHighs: [high],
    swingLows: [low],
    lastSwingHigh: high,
    lastSwingLow: low,
    lastBOS: null,
    lastCHOCH: withChoch ? choch : null,
    structurePoints: withChoch ? [choch] : [],
    breakEvents: withChoch ? [choch] : [],
    trendStrength: 0,
    equalHighs: [],
    equalLows: [],
  };
}

const highVolatility: RegimeResultData = {
  regime: "HIGH_VOLATILITY",
  baseRegime: "HIGH_VOLATILITY",
  direction: "NEUTRAL",
  strength: 25,
  adx: 20,
  ema20: 1.104,
  ema50: 1.105,
  ema200: 1.106,
  atr: 0.003,
  bandWidthRatio: 1.2,
};

function qualified(): ReversalQualification {
  return {
    qualified: true,
    direction: "SHORT",
    transition: {
      type: "CHOCH",
      index: 34,
      timestamp: T0 + 34 * H4,
      price: 1.0980,
      direction: "SHORT",
      confirmed: true,
      confirmedAtIndex: 34,
      confirmedAtTimestamp: T0 + 34 * H4,
    },
    exhaustionSwing: swing(25, 1.1100, "high"),
    exhaustionLevel: 1.1122,
    sweepIndex: 30,
    sweepTimestamp: T0 + 30 * H4,
    sweepDistanceAtr: 0.8,
    transitionAgeBars: 5,
    reasonCode: "REVERSAL_QUALIFIED",
    reason:
      "Fresh SHORT H4 CHOCH followed an exhaustion sweep of confirmed high.",
  };
}

function h1Candles(): OHLCV[] {
  const start = T0 + 34 * H4 + HOUR;
  return Array.from({ length: 30 }, (_, i) => {
    const close = 1.1000 - i * 0.0001;
    return {
      timestamp: start + i * HOUR,
      open: close + 0.0002,
      high: close + 0.0007,
      low: close - 0.0007,
      close,
      volume: 1000,
    };
  });
}

function m15Candles(withRetest = true): OHLCV[] {
  const start = T0 + 34 * H4 + 2 * HOUR;
  const out: OHLCV[] = [];
  for (let i = 0; i < 10; i++) {
    const close = 1.0960 - i * 0.00012;
    out.push({
      timestamp: start + i * 15 * 60 * 1000,
      open: close + 0.0001,
      high: close + 0.00035,
      low: close - 0.00035,
      close,
      volume: 1100,
    });
  }
  if (withRetest) {
    out[6] = {
      timestamp: start + 6 * 15 * 60 * 1000,
      open: 1.0993,
      high: 1.0997,
      low: 1.0960,
      close: 1.0965,
      volume: 1800,
    };
    out[7] = {
      timestamp: start + 7 * 15 * 60 * 1000,
      open: 1.0966,
      high: 1.0969,
      low: 1.0950,
      close: 1.0952,
      volume: 1700,
    };
    out[8] = {
      timestamp: start + 8 * 15 * 60 * 1000,
      open: 1.0953,
      high: 1.0955,
      low: 1.0938,
      close: 1.0940,
      volume: 1700,
    };
    out[9] = {
      timestamp: start + 9 * 15 * 60 * 1000,
      open: 1.0941,
      high: 1.0943,
      low: 1.0928,
      close: 1.0930,
      volume: 1700,
    };
  }
  return out;
}

function triggerStructure(
  candles: OHLCV[],
  eventIndex: number
): StructureResultData {
  const event = {
    type: "BOS" as const,
    index: eventIndex,
    timestamp: candles[eventIndex].timestamp,
    price: 1.0950,
    direction: "SHORT" as const,
    confirmed: true,
    confirmedAtIndex: eventIndex,
    confirmedAtTimestamp: candles[eventIndex].timestamp,
  };
  return {
    trend: "SHORT",
    swingHighs: [],
    swingLows: [],
    lastSwingHigh: null,
    lastSwingLow: null,
    lastBOS: event,
    lastCHOCH: null,
    structurePoints: [event],
    breakEvents: [event],
    trendStrength: 70,
    equalHighs: [],
    equalLows: [],
  };
}

describe("Phase 12.4.3 REVERSAL qualification", () => {
  it("requires HIGH_VOLATILITY + fresh CHOCH + pre-transition exhaustion sweep", () => {
    const result = qualifyReversal({
      candles: h4Candles(),
      structure: reversalStructure(true),
      regime: highVolatility,
      pipSize: 0.0001,
    });

    expect(result.qualified).toBe(true);
    expect(result.direction).toBe("SHORT");
    expect(result.reasonCode).toBe("REVERSAL_QUALIFIED");
    expect(result.exhaustionLevel).toBeCloseTo(1.1122);
    expect(result.transition?.type).toBe("CHOCH");
  });

  it("does not infer reversal from HIGH_VOLATILITY without CHOCH", () => {
    const result = qualifyReversal({
      candles: h4Candles(),
      structure: reversalStructure(false),
      regime: highVolatility,
      pipSize: 0.0001,
    });

    expect(result.qualified).toBe(false);
    expect(result.reasonCode).toBe("REVERSAL_CHOCH_MISSING");
  });

  it("does not infer reversal from CHOCH when exhaustion sweep is absent", () => {
    const candles = h4Candles();
    candles[30] = {
      ...candles[30],
      high: 1.1102,
      close: 1.1098,
    };
    const result = qualifyReversal({
      candles,
      structure: reversalStructure(true),
      regime: highVolatility,
      pipSize: 0.0001,
    });

    expect(result.qualified).toBe(false);
    expect(result.reasonCode).toBe("REVERSAL_SWEEP_MISSING");
  });
});

describe("Phase 12.4.3 REVERSAL setup", () => {
  it("arms after a qualified transition level is retested and held", () => {
    const trigger = m15Candles(true);
    const result = analyzeReversalSetup({
      setupCandles: h1Candles(),
      triggerCandles: trigger,
      qualification: qualified(),
      pipSize: 0.0001,
      marketAsOf: trigger.at(-1)!.timestamp,
    });

    expect(result.bias.data.direction).toBe("SHORT");
    expect(result.setup.data.setupType).toBe("reversal-transition-retest");
    expect(result.setup.data.state).toBe("ARMED");
    expect(result.retestTimestamp).not.toBeNull();
  });

  it("does not chase a qualified reversal after price is extended", () => {
    const trigger = m15Candles(false).map((c) => ({
      ...c,
      open: c.open - 0.01,
      high: c.high - 0.01,
      low: c.low - 0.01,
      close: c.close - 0.01,
    }));
    const result = analyzeReversalSetup({
      setupCandles: h1Candles(),
      triggerCandles: trigger,
      qualification: qualified(),
      pipSize: 0.0001,
    });

    expect(result.setup.data.state).toBe("WATCH");
    expect(
      result.setup.evidence.some((item) => item.code === "REVERSAL_NO_CHASE")
    ).toBe(true);
  });
});

describe("Phase 12.4.3 REVERSAL trigger", () => {
  const setup: SetupResultData = {
    state: "ARMED",
    zoneLow: 1.0970,
    zoneHigh: 1.0990,
    distanceToZone: 0,
    setupType: "reversal-transition-retest",
    setupScore: 85,
    invalidationLevel: 1.1132,
    zoneSource: "h4-choch-transition",
  };

  it("confirms only after retest, rejection quality, and fresh post-retest structure", () => {
    const candles = m15Candles(true);
    const result = evaluateReversalTrigger({
      candles,
      setup,
      structure: triggerStructure(candles, 8),
      direction: "SHORT",
      qualification: qualified(),
    });

    expect(result.data.breakdown.location.fired).toBe(true);
    expect(result.data.breakdown.candle.fired).toBe(true);
    expect(result.data.breakdown.structural.name).toBe("BOS");
    expect(result.data.state).toBe("CONFIRMED");
    expect(result.data.triggerType).toContain("REVERSAL_RETEST");
  });

  it("stays WAITING without a transition retest", () => {
    const candles = m15Candles(false);
    const result = evaluateReversalTrigger({
      candles,
      setup,
      structure: triggerStructure(candles, 8),
      direction: "SHORT",
      qualification: qualified(),
    });

    expect(result.data.state).toBe("WAITING");
    expect(
      result.conflicts.some((item) => item.code === "REVERSAL_RETEST_MISSING")
    ).toBe(true);
  });

  it("does not recycle M15 structure printed before the retest", () => {
    const candles = m15Candles(true);
    const result = evaluateReversalTrigger({
      candles,
      setup,
      structure: triggerStructure(candles, 4),
      direction: "SHORT",
      qualification: qualified(),
    });

    expect(result.data.state).toBe("WAITING");
    expect(
      result.conflicts.some(
        (item) => item.code === "REVERSAL_STRUCTURE_TURN_MISSING"
      )
    ).toBe(true);
  });
});
