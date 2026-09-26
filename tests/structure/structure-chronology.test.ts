import { describe, expect, it } from "vitest";
import type { OHLCV } from "@/types/market";
import { analyzeStructure } from "@/core/structure";
import { bearishTrend, bullishTrend } from "../fixtures/candles";

const HOUR = 60 * 60 * 1000;
const SWING_LOOKBACK = 3;

function appendCloseAboveRecentHigh(candles: OHLCV[]): OHLCV[] {
  const maxHigh = Math.max(...candles.slice(-20).map((c) => c.high));
  const close = maxHigh * 1.002;
  return [
    ...candles,
    {
      timestamp: candles[candles.length - 1].timestamp + 4 * HOUR,
      open: maxHigh,
      high: close * 1.0005,
      low: maxHigh * 0.9995,
      close,
      volume: 2000,
    },
  ];
}

function appendCloseBelowRecentLow(candles: OHLCV[]): OHLCV[] {
  const minLow = Math.min(...candles.slice(-20).map((c) => c.low));
  const close = minLow * 0.998;
  return [
    ...candles,
    {
      timestamp: candles[candles.length - 1].timestamp + 4 * HOUR,
      open: minLow,
      high: minLow * 1.0005,
      low: close * 0.9995,
      close,
      volume: 2000,
    },
  ];
}

/** Append bars that close back below a broken level, retracing the break. */
function retraceBelow(candles: OHLCV[], level: number, bars = 4): OHLCV[] {
  let out = [...candles];
  for (let i = 0; i < bars; i++) {
    const open = out[out.length - 1].close;
    const close = level * (1 - 0.001 * (i + 1));
    out = [
      ...out,
      {
        timestamp: out[out.length - 1].timestamp + 4 * HOUR,
        open,
        high: Math.max(open, close) + 0.0004,
        low: Math.min(open, close) - 0.0004,
        close,
        volume: 1500,
      },
    ];
  }
  return out;
}

describe("analyzeStructure - swing confirmation has no look-ahead", () => {
  it("never reports a swing for the last `swingLookback` bars", () => {
    const candles = bullishTrend(140);
    const { data } = analyzeStructure(candles);
    const lastIndex = candles.length - 1;
    for (const swing of [...data.swingHighs, ...data.swingLows]) {
      expect(swing.index).toBeLessThanOrEqual(lastIndex - SWING_LOOKBACK);
      expect(swing.confirmedAtIndex).toBe(swing.index + SWING_LOOKBACK);
      expect(swing.confirmedAtTimestamp).toBe(
        candles[swing.confirmedAtIndex].timestamp
      );
    }
  });

  it("does not observe a pivot before its confirmation candle exists", () => {
    // A pivot needs `swingLookback` bars on both sides. Truncating the series
    // one bar before the confirmation bar must hide the pivot entirely.
    const candles = bullishTrend(140);
    const full = analyzeStructure(candles);
    const swing = full.data.swingHighs[0];

    const beforeConfirmation = candles.slice(
      0,
      swing.index + SWING_LOOKBACK
    );
    expect(
      analyzeStructure(beforeConfirmation).data.swingHighs.some(
        (candidate) => candidate.index === swing.index
      )
    ).toBe(false);
  });

  it("observes a pivot on the bar it becomes confirmable", () => {
    const candles = bullishTrend(140);
    const full = analyzeStructure(candles);
    const swing = full.data.swingHighs[0];

    const atConfirmation = candles.slice(0, swing.index + SWING_LOOKBACK + 1);
    const observed = analyzeStructure(atConfirmation).data.swingHighs.find(
      (candidate) => candidate.index === swing.index
    );
    expect(observed).toBeDefined();
    expect(observed!.confirmedAtIndex).toBe(swing.index + SWING_LOOKBACK);
  });
});

describe("analyzeStructure - break event anchoring", () => {
  it("anchors every break at or after the broken swing's confirmation", () => {
    const candles = appendCloseAboveRecentHigh(bullishTrend(140));
    const { data } = analyzeStructure(candles);
    expect(data.breakEvents.length).toBeGreaterThan(0);
    for (const event of data.breakEvents) {
      expect(event.confirmedAtIndex).toBe(event.index);
      expect(event.confirmedAtTimestamp).toBe(candles[event.index].timestamp);
      const broken = [...data.swingHighs, ...data.swingLows].find(
        (swing) => swing.price === event.price
      );
      expect(broken).toBeDefined();
      expect(event.confirmedAtIndex).toBeGreaterThanOrEqual(
        broken!.confirmedAtIndex
      );
    }
  });
});

describe("analyzeStructure - CHOCH in both directions", () => {
  it("labels a bullish reversal as CHOCH in the LONG direction", () => {
    // Downtrend, then a decisive close back above a prior swing high.
    const candles = appendCloseAboveRecentHigh(bearishTrend(140));
    const { data } = analyzeStructure(candles);
    expect(data.lastCHOCH).not.toBeNull();
    expect(data.lastCHOCH!.type).toBe("CHOCH");
    expect(data.lastCHOCH!.direction).toBe("LONG");
  });

  it("labels a bearish reversal as CHOCH in the SHORT direction", () => {
    // Uptrend, then a decisive close below a prior swing low.
    const candles = appendCloseBelowRecentLow(bullishTrend(140));
    const { data } = analyzeStructure(candles);
    expect(data.lastCHOCH).not.toBeNull();
    expect(data.lastCHOCH!.type).toBe("CHOCH");
    expect(data.lastCHOCH!.direction).toBe("SHORT");
  });
});

describe("analyzeStructure - BOS continuation and persistence", () => {
  it("labels a continuation break in an uptrend as BOS in the LONG direction", () => {
    const candles = appendCloseAboveRecentHigh(bullishTrend(140));
    const { data } = analyzeStructure(candles);
    expect(data.lastBOS).not.toBeNull();
    expect(data.lastBOS!.type).toBe("BOS");
    expect(data.lastBOS!.direction).toBe("LONG");
  });

  it("keeps a confirmed BOS in breakEvents after price retraces back inside", () => {
    const broken = appendCloseAboveRecentHigh(bullishTrend(140));
    const before = analyzeStructure(broken);
    expect(before.data.lastBOS).not.toBeNull();
    const event = before.data.lastBOS!;

    const retraced = retraceBelow(broken, event.price);
    const after = analyzeStructure(retraced);

    // The break is a historical fact and must survive the retracement.
    expect(
      after.data.breakEvents.some(
        (candidate) =>
          candidate.type === "BOS" &&
          candidate.direction === "LONG" &&
          candidate.price === event.price
      )
    ).toBe(true);
    expect(after.data.breakEvents.length).toBeGreaterThanOrEqual(
      before.data.breakEvents.length
    );
  });
});