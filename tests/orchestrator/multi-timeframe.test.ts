import { describe, expect, it } from "vitest";
import type { OHLCV, CurrencyPair } from "@/types/market";
import type { StructureResultData } from "@/types/engine";
import { analyzeMarket } from "@/core/orchestrator";
import type { TimeframeInput } from "@/core/orchestrator";
import { analyzeSetup } from "@/core/setup";
import { analyzeStructure } from "@/core/structure";
import {
  bullishTrend,
  bullishTrendWithPullback,
  EURUSD,
  rangeSeries,
  snapshot,
} from "../fixtures/candles";

const EURUSD_PAIR: CurrencyPair = { ...EURUSD };

function tf(
  timeframe: "H4" | "H1" | "M15",
  candles: OHLCV[]
): TimeframeInput {
  return { timeframe, snapshot: snapshot(candles, timeframe) };
}

function stubStructure(overrides: {
  lastSwingLowPrice?: number;
  lastSwingHighPrice?: number;
  lastSwingLowIndex?: number;
  lastSwingHighIndex?: number;
}): StructureResultData {
  return {
    trend: "LONG",
    swingHighs: [],
    swingLows: [],
    lastSwingHigh: {
      index: overrides.lastSwingHighIndex ?? 1,
      timestamp: 1,
      price: overrides.lastSwingHighPrice ?? 1.05,
      kind: "high",
      confirmedAtIndex: 4,
      confirmedAtTimestamp: 4,
    },
    lastSwingLow: {
      index: overrides.lastSwingLowIndex ?? 1,
      timestamp: 1,
      price: overrides.lastSwingLowPrice ?? 0.95,
      kind: "low",
      confirmedAtIndex: 4,
      confirmedAtTimestamp: 4,
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

describe("orchestrator - per-timeframe structure isolation", () => {
  it("resolves zones against the setup array when H4/H1/M15 lengths differ sharply", () => {
    // H4 is long, H1 is longer, M15 is short. If any higher-timeframe swing
    // index leaked into a shorter candle array, an out-of-bounds lookup would
    // surface as a crash or a NaN zone. The zone is populated and finite, which
    // proves the setup structure was resolved against the setup candles.
    const result = analyzeMarket({
      instrument: EURUSD_PAIR,
      biasTimeframe: tf("H4", bullishTrend(140)),
      setupTimeframe: tf("H1", bullishTrendWithPullback(120)),
      triggerTimeframe: tf("M15", bullishTrendWithPullback(30)),
      accountBalance: 10_000,
      accountCurrency: "USD",
    });

    const setup = result.setup.data;
    expect(Number.isFinite(setup.zoneLow)).toBe(true);
    expect(Number.isFinite(setup.zoneHigh)).toBe(true);
    expect(Number.isFinite(setup.distanceToZone)).toBe(true);
    expect(Number.isFinite(setup.invalidationLevel)).toBe(true);
    // A real zone was built from the setup-timeframe swings.
    expect(setup.zoneHigh).toBeGreaterThan(setup.zoneLow);
  });

  it("uses independent timestamps per timeframe without contamination", () => {
    const biasCandles = rangeSeries(80, 1.1, 0.003, "H4");
    const setupCandles = rangeSeries(60, 1.1, 0.003, "H1");
    const triggerCandles = rangeSeries(45, 1.1, 0.003, "M15");

    const result = analyzeMarket({
      instrument: EURUSD_PAIR,
      biasTimeframe: tf("H4", biasCandles),
      setupTimeframe: tf("H1", setupCandles),
      triggerTimeframe: tf("M15", triggerCandles),
      accountBalance: 10_000,
      accountCurrency: "USD",
    });

    // Every stage timestamp must fall inside its own timeframe's window.
    expect(result.structure.timestamp).toBe(
      new Date(biasCandles[biasCandles.length - 1].timestamp).toISOString()
    );
    expect(result.setup.timestamp).toBe(
      new Date(setupCandles[setupCandles.length - 1].timestamp).toISOString()
    );
  });

  it("stamps each stage with deterministic market time rather than wall-clock drift", () => {
    const biasCandles = bullishTrend(140);
    const result = analyzeMarket({
      instrument: EURUSD_PAIR,
      biasTimeframe: tf("H4", biasCandles),
      setupTimeframe: tf("H1", bullishTrendWithPullback(120)),
      triggerTimeframe: tf("M15", bullishTrendWithPullback(40)),
      accountBalance: 10_000,
      accountCurrency: "USD",
    });

    const expected = new Date(
      biasCandles[biasCandles.length - 1].timestamp
    ).toISOString();
    expect(result.structure.timestamp).toBe(expected);
    expect(result.regime.timestamp).toBe(expected);
    expect(result.bias.timestamp).toBe(expected);
  });
});

describe("analyzeSetup - higher-timeframe confluence is price-only", () => {
  it("never indexes the setup array with a foreign-timeframe swing index", () => {
    const candles = bullishTrendWithPullback(80);
    const structure = analyzeStructure(candles);

    // A confluence structure whose swing index is far outside the setup array.
    // Correct code reads only `price` from it; code that leaked the index would
    // read `candles[5000]` and emit NaN zones.
    const result = analyzeSetup(
      candles,
      {
        direction: "LONG",
        label: "LONG",
        score: 50,
        components: {} as never,
        weights: {} as never,
      },
      structure.data,
      0.0001,
      undefined,
      stubStructure({
        lastSwingLowPrice: structure.data.lastSwingLow!.price,
        lastSwingLowIndex: 5000,
      }),
      candles[candles.length - 1].timestamp
    );

    expect(Number.isFinite(result.data.zoneLow)).toBe(true);
    expect(Number.isFinite(result.data.zoneHigh)).toBe(true);
    expect(result.data.zoneLow).toBeLessThanOrEqual(result.data.zoneHigh);
  });

  it("resolves every setup-zone swing index against its own candle array", () => {
    const candles = bullishTrendWithPullback(90);
    const structure = analyzeStructure(candles);
    for (const swing of [
      ...structure.data.swingHighs,
      ...structure.data.swingLows,
    ]) {
      expect(swing.index).toBeGreaterThanOrEqual(0);
      expect(swing.index).toBeLessThan(candles.length);
      expect(swing.timestamp).toBe(candles[swing.index].timestamp);
    }
  });
});