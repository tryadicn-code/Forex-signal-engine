import type { OHLCV } from "@/types/market";
import type {
  BiasResultData,
  EngineResult,
  Evidence,
  SetupResultData,
  StructureResultData,
} from "@/types/engine";
import { ema, engineTimestamp, last } from "@/core/indicators";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import {
  DEFAULT_PRICE_ACTION_CONFIG,
  type PriceActionConfig,
} from "./config";

export type PriceActionFamily =
  | "TREND_PULLBACK"
  | "BREAKOUT_RETEST"
  | "REVERSAL"
  | "none";

export interface PriceActionSetupAnalysis {
  result: EngineResult<SetupResultData>;
  family: PriceActionFamily;
  emaContext: "BULLISH" | "BEARISH" | "MIXED";
}

export interface PriceActionSetupInput {
  setupCandles: OHLCV[];
  triggerCandles: OHLCV[];
  setupStructure: StructureResultData;
  bias: BiasResultData;
  pipSize: number;
  coreConfigOverrides?: DeepPartial<EngineConfig>;
  strategyConfig?: Partial<PriceActionConfig>;
  marketAsOf?: number;
}

function mergeConfig(overrides?: Partial<PriceActionConfig>): PriceActionConfig {
  return { ...DEFAULT_PRICE_ACTION_CONFIG, ...(overrides ?? {}) };
}

function emaContextOf(
  candles: OHLCV[],
  config: PriceActionConfig
): "BULLISH" | "BEARISH" | "MIXED" {
  const px = candles.map((c) => c.close);
  const emaShort = last(ema(px, config.emaShort)) ?? 0;
  const emaMid = last(ema(px, config.emaMid)) ?? 0;
  const emaLong = last(ema(px, config.emaLong)) ?? 0;
  if (emaShort > emaMid && emaMid > emaLong) return "BULLISH";
  if (emaShort < emaMid && emaMid < emaLong) return "BEARISH";
  return "MIXED";
}

/**
 * PRICE_ACTION setup classifier (TRD-RR-006).
 *
 * Keluarga yang diimplementasi di MVP: TREND_PULLBACK dan BREAKOUT_RETEST.
 * REVERSAL disiapkan sebagai slot (enableReversal=false) dan belum diaktif.
 *
 * Setup hanya memvalidasi bahwa ada ZONA yang valid untuk keluarga terpilih.
 * Trigger (BOS/CHOCH/reclaim + candle PA) dievaluasi terpisah di trigger.ts.
 */
export function analyzePriceActionSetup(
  input: PriceActionSetupInput
): PriceActionSetupAnalysis {
  const config = mergeConfig(input.strategyConfig);
  resolveConfig(input.coreConfigOverrides); // validasi config global

  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const candles = input.setupCandles;
  const price = last(candles.map((c) => c.close)) ?? 0;
  const empty: EngineResult<SetupResultData> = {
    status: "SETUP_NONE",
    score: 0,
    evidence,
    conflicts,
    data: {
      state: "NONE",
      zoneLow: 0,
      zoneHigh: 0,
      distanceToZone: 0,
      setupType: "none",
      setupScore: 0,
      invalidationLevel: 0,
      zoneSource: "none",
    },
    timestamp: engineTimestamp(input.marketAsOf),
  };

  if (input.bias.direction === "NEUTRAL") {
    return { result: empty, family: "none", emaContext: "MIXED" };
  }

  const emaContext = emaContextOf(candles, config);
  const long = input.bias.direction === "LONG";

  // Keluarga 1: TREND_PULLBACK
  if (config.enableTrendPullback) {
    const pullback = tryTrendPullback(input, config, long, emaContext, evidence);
    if (pullback) {
      return {
        result: pullback,
        family: "TREND_PULLBACK",
        emaContext,
      };
    }
  }

  // Keluarga 2: BREAKOUT_RETEST
  if (config.enableBreakoutRetest) {
    const breakout = tryBreakoutRetest(input, config, long, price, evidence);
    if (breakout) {
      return {
        result: breakout,
        family: "BREAKOUT_RETEST",
        emaContext,
      };
    }
  }

  // Keluarga 3: REVERSAL (belum aktif di MVP)
  if (config.enableReversal) {
    evidence.push({
      code: "REVERSAL_DISABLED",
      label: "Reversal family",
      description: "Reversal family belum diimplementasi di MVP.",
    });
  }

  return { result: empty, family: "none", emaContext };
}

function tryTrendPullback(
  input: PriceActionSetupInput,
  config: PriceActionConfig,
  long: boolean,
  emaContext: "BULLISH" | "BEARISH" | "MIXED",
  evidence: Evidence[]
): EngineResult<SetupResultData> | null {
  // EMA context harus align kalau requireEmaAlignment=true
  if (config.requireEmaAlignment) {
    const aligned = long ? emaContext === "BULLISH" : emaContext === "BEARISH";
    if (!aligned) return null;
  }

  // Zona pullback: EMA mid dynamic + swing S/R terdekat di sisi trade
  const px = input.setupCandles.map((c) => c.close);
  const emaMid = last(ema(px, config.emaMid)) ?? 0;
  if (emaMid <= 0) return null;

  const buffer = config.zoneBufferPips * input.pipSize;
  const zoneLow = emaMid - buffer;
  const zoneHigh = emaMid + buffer;

  // Invalidation: swing low terakhir (LONG) atau swing high (SHORT)
  const swings = long ? input.setupStructure.swingLows : input.setupStructure.swingHighs;
  const lastSwing = swings[swings.length - 1];
  if (!lastSwing) return null;

  const invalidation = long
    ? lastSwing.price - buffer
    : lastSwing.price + buffer;

  // Pastikan SL di sisi yang benar
  const price = last(px) ?? 0;
  if (long && invalidation >= price) return null;
  if (!long && invalidation <= price) return null;

  evidence.push({
    code: "TREND_PULLBACK_ZONE",
    label: "Pullback zone",
    description: `EMA${config.emaMid} zone ${zoneLow.toFixed(5)}-${zoneHigh.toFixed(5)}.`,
    value: emaMid,
  });

  return {
    status: "SETUP_ARMED",
    score: 70,
    evidence,
    conflicts: [],
    data: {
      state: "ARMED",
      zoneLow,
      zoneHigh,
      distanceToZone: Math.abs(price - emaMid) / input.pipSize,
      setupType: "trend-pullback-ema",
      setupScore: 70,
      invalidationLevel: invalidation,
      zoneSource: "price-action-ema",
    },
    timestamp: engineTimestamp(input.marketAsOf),
  };
}

function tryBreakoutRetest(
  input: PriceActionSetupInput,
  config: PriceActionConfig,
  long: boolean,
  price: number,
  evidence: Evidence[]
): EngineResult<SetupResultData> | null {
  const lastBreak = input.setupStructure.lastBOS ?? input.setupStructure.lastCHOCH;
  if (!lastBreak) return null;
  if (lastBreak.direction !== (long ? "LONG" : "SHORT")) return null;

  const buffer = config.zoneBufferPips * input.pipSize;
  const level = lastBreak.price;
  const zoneLow = level - buffer;
  const zoneHigh = level + buffer;

  // Harga harus retest level (di dalam atau dekat zona)
  const nearZone =
    price >= zoneLow - config.zoneBufferPips * 2 * input.pipSize &&
    price <= zoneHigh + config.zoneBufferPips * 2 * input.pipSize;
  if (!nearZone) return null;

  const swings = long ? input.setupStructure.swingLows : input.setupStructure.swingHighs;
  const lastSwing = swings[swings.length - 1];
  if (!lastSwing) return null;

  const invalidation = long
    ? lastSwing.price - buffer
    : lastSwing.price + buffer;

  evidence.push({
    code: "BREAKOUT_RETEST_ZONE",
    label: "Breakout-retest zone",
    description: `${lastBreak.type} at ${level.toFixed(5)}, retest zone ${zoneLow.toFixed(5)}-${zoneHigh.toFixed(5)}.`,
    value: level,
  });

  return {
    status: "SETUP_ARMED",
    score: 65,
    evidence,
    conflicts: [],
    data: {
      state: "ARMED",
      zoneLow,
      zoneHigh,
      distanceToZone: Math.abs(price - level) / input.pipSize,
      setupType: "breakout-retest",
      setupScore: 65,
      invalidationLevel: invalidation,
      zoneSource: "price-action-breakout",
    },
    timestamp: engineTimestamp(input.marketAsOf),
  };
}