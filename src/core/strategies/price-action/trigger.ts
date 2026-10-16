import type { OHLCV, Direction } from "@/types/market";
import type {
  EngineResult,
  Evidence,
  SetupResultData,
  StructureResultData,
  TriggerBreakdown,
  TriggerComponentState,
  TriggerResultData,
} from "@/types/engine";
import { engineTimestamp } from "@/core/indicators";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import {
  DEFAULT_PRICE_ACTION_CONFIG,
  type PriceActionConfig,
} from "./config";

export interface PriceActionTriggerInput {
  triggerCandles: OHLCV[];
  setup: SetupResultData;
  structure: StructureResultData;
  direction: Direction;
  coreConfigOverrides?: DeepPartial<EngineConfig>;
  strategyConfig?: Partial<PriceActionConfig>;
  marketAsOf?: number;
}

function mergeConfig(overrides?: Partial<PriceActionConfig>): PriceActionConfig {
  return { ...DEFAULT_PRICE_ACTION_CONFIG, ...(overrides ?? {}) };
}

function notFired(): TriggerComponentState {
  return { name: null, fired: false, index: null, timestamp: null };
}

/**
 * Structural confirmation: BOS / CHOCH / reclaim in the trade direction.
 * Mirrors the existing trigger engine's detectStructural but without
 * momentum/volume components.
 */
function detectStructural(
  structure: StructureResultData,
  direction: Direction,
  candles: OHLCV[],
  maxAgeBars: number
): TriggerComponentState {
  const lastIndex = candles.length - 1;
  const candidates: Array<{ name: string; index: number }> = [];

  // TRD-RR-009: scan breakEvents backward for the most recent BOS and
  // CHOCH in the wanted direction. The legacy code only looked at
  // lastBOS/lastCHOCH (whichever fired last, regardless of direction),
  // so a recent opposite-side event could mask a valid same-side one.
  for (let i = structure.breakEvents.length - 1; i >= 0; i--) {
    const ev = structure.breakEvents[i];
    if (ev.type === "BOS" && ev.direction === direction) {
      candidates.push({ name: "BOS", index: ev.index });
      break;
    }
  }
  for (let i = structure.breakEvents.length - 1; i >= 0; i--) {
    const ev = structure.breakEvents[i];
    if (ev.type === "CHOCH" && ev.direction === direction) {
      candidates.push({ name: "CHOCH", index: ev.index });
      break;
    }
  }

  const lastBreak = structure.breakEvents[structure.breakEvents.length - 1] ?? null;
  if (lastBreak && lastBreak.direction !== direction && lastIndex >= 0) {
    const close = candles[lastIndex].close;
    const reclaimed =
      direction === "LONG" ? close > lastBreak.price : close < lastBreak.price;
    if (reclaimed) candidates.push({ name: "RECLAIM", index: lastIndex });
  }
  if (candidates.length === 0) return notFired();
  const best = candidates.reduce((a, b) => (b.index > a.index ? b : a));
  const ageInBars = lastIndex - best.index;
  const fired = ageInBars <= maxAgeBars;
  return {
    name: best.name,
    fired,
    index: best.index,
    timestamp: candles[best.index].timestamp,
  };
}

function detectLocation(
  candles: OHLCV[],
  setup: SetupResultData,
  long: boolean
): TriggerComponentState {
  const n = candles.length;
  if (n === 0) return notFired();
  const current = candles[n - 1];
  const insideZone =
    current.close >= setup.zoneLow && current.close <= setup.zoneHigh;
  if (insideZone) {
    return { name: "IN_ZONE", fired: true, index: n - 1, timestamp: current.timestamp };
  }
  const swept = long ? current.low <= setup.zoneHigh : current.high >= setup.zoneLow;
  const rejected = long ? current.close > setup.zoneHigh : current.close < setup.zoneLow;
  const held = long ? current.close > current.open : current.close < current.open;
  if (swept && rejected && held) {
    return { name: "RETEST", fired: true, index: n - 1, timestamp: current.timestamp };
  }
  return { name: "OUTSIDE", fired: false, index: n - 1, timestamp: current.timestamp };
}

interface CandleCheck {
  fired: boolean;
  index: number | null;
  describe: () => string;
}

function engulfing(candles: OHLCV[], long: boolean, minBodyRatio: number): CandleCheck {
  const n = candles.length;
  if (n < 2) return { fired: false, index: null, describe: () => "Not enough candles" };
  const prev = candles[n - 2];
  const curr = candles[n - 1];
  const prevBody = prev.close - prev.open;
  const currBody = curr.close - curr.open;
  const prevRange = Math.max(prev.high - prev.low, 1e-9);
  const bullish = prevBody < 0 && currBody > 0 && curr.close > prev.high;
  const bearish = prevBody > 0 && currBody < 0 && curr.close < prev.low;
  const strongBody = Math.abs(currBody) / prevRange >= minBodyRatio;
  const fired = (long ? bullish : bearish) && strongBody;
  return {
    fired,
    index: fired ? n - 1 : null,
    describe: () =>
      `Engulfing ${long ? "bullish" : "bearish"} body ratio ${(Math.abs(currBody) / prevRange * 100).toFixed(0)}%.`,
  };
}

function rejectionCandle(candles: OHLCV[], long: boolean, wickRatio: number): CandleCheck {
  const n = candles.length;
  if (n === 0) return { fired: false, index: null, describe: () => "No candles" };
  const c = candles[n - 1];
  const body = Math.abs(c.close - c.open);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  if (body <= 0) return { fired: false, index: null, describe: () => "Doji" };
  const wick = long ? lowerWick : upperWick;
  const fired = wick >= wickRatio * body;
  return {
    fired,
    index: fired ? n - 1 : null,
    describe: () => `Rejection wick ratio ${(wick / body).toFixed(2)}.`,
  };
}

function detectCandle(
  candles: OHLCV[],
  long: boolean,
  config: PriceActionConfig
): TriggerComponentState {
  const engulf = engulfing(candles, long, config.engulfMinBodyRatio);
  if (engulf.fired && engulf.index !== null) {
    return {
      name: "ENGULFING",
      fired: true,
      index: engulf.index,
      timestamp: candles[engulf.index].timestamp,
    };
  }
  const rejection = rejectionCandle(candles, long, config.rejectionWickRatio);
  if (rejection.fired && rejection.index !== null) {
    return {
      name: "REJECTION",
      fired: true,
      index: rejection.index,
      timestamp: candles[rejection.index].timestamp,
    };
  }
  return notFired();
}

/**
 * PRICE_ACTION trigger (TRD-RR-006).
 *
 * Hard requirement: structural + location + candle ALL must fire.
 * Tidak ada momentum/volume gate. Tidak ada composite score threshold.
 */
export function evaluatePriceActionTrigger(
  input: PriceActionTriggerInput
): EngineResult<TriggerResultData> {
  const config = mergeConfig(input.strategyConfig);
  resolveConfig(input.coreConfigOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const candles = input.triggerCandles;
  const long = input.direction === "LONG";
  const lastIndex = candles.length - 1;

  const structural = detectStructural(
    input.structure,
    input.direction,
    candles,
    config.maxTriggerAgeBars
  );
  const location = detectLocation(candles, input.setup, long);
  const candle = detectCandle(candles, long, config);

  const confirmed = structural.fired && location.fired && candle.fired;

  evidence.push({
    code: "PA_STRUCTURAL",
    label: "Structural confirmation",
    description: structural.fired ? `Fired: ${structural.name}` : "Not fired.",
    value: structural.name ?? undefined,
  });
  evidence.push({
    code: "PA_LOCATION",
    label: "Location validation",
    description: location.fired ? `Fired: ${location.name}` : "Not fired.",
    value: location.name ?? undefined,
  });
  evidence.push({
    code: "PA_CANDLE",
    label: "Candle confirmation",
    description: candle.fired ? `Fired: ${candle.name}` : "Not fired.",
    value: candle.name ?? undefined,
  });

  if (!structural.fired) {
    conflicts.push({
      code: "PA_NO_STRUCTURE",
      label: "No fresh structural break",
      description: "BOS/CHOCH/reclaim in the trade direction is required.",
    });
  }
  if (!location.fired) {
    conflicts.push({
      code: "PA_NOT_IN_ZONE",
      label: "Price not in setup zone",
      description: "Entry price must be inside or retest the setup zone.",
    });
  }
  if (!candle.fired) {
    conflicts.push({
      code: "PA_NO_CANDLE",
      label: "No price action confirmation",
      description: "Engulfing or rejection candle is required.",
    });
  }

  const state = confirmed ? "CONFIRMED" : "WAITING";
  const triggerType = confirmed
    ? `${structural.name}+${location.name}+${candle.name}`
    : null;
  const triggerIndex = confirmed
    ? Math.max(
        structural.index ?? 0,
        location.index ?? 0,
        candle.index ?? 0
      )
    : null;
  const triggerTimestamp =
    triggerIndex !== null && candles[triggerIndex]
      ? candles[triggerIndex].timestamp
      : null;
  const ageInBars = triggerIndex !== null ? lastIndex - triggerIndex : null;

  const breakdown: TriggerBreakdown = {
    structural,
    location,
    candle,
    momentum: { rsi: 0, macdHistogram: 0, aligned: false },
    score: confirmed ? 100 : 0,
  };

  return {
    status: confirmed ? "TRIGGER_CONFIRMED" : "TRIGGER_WAITING",
    score: confirmed ? 100 : 0,
    evidence,
    conflicts,
    data: {
      state,
      triggerType,
      triggerIndex,
      triggerTimestamp,
      ageInBars,
      breakdown,
    },
    timestamp: engineTimestamp(input.marketAsOf),
  };
}
