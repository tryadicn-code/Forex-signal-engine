import type { BiasComponent } from "@/types/engine";

/** Recursively optional type, so callers can override one threshold without
 * having to resupply every other value in the section. */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends unknown[]
    ? T[P]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

/**
 * Central, overridable engine configuration.
 *
 * Every threshold the engines use lives here - nothing is hardcoded inside an
 * engine. Callers pass a `Partial<EngineConfig>` (often per-pair or per-strategy)
 * and only the listed keys override the defaults.
 */
export interface EngineConfig {
  indicators: {
    emaShort: number;
    emaMid: number;
    emaLong: number;
    rsiPeriod: number;
    atrPeriod: number;
    adxPeriod: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
    bollingerPeriod: number;
    bollingerMultiplier: number;
  };
  structure: {
    /** Candles on each side of a candidate swing used to confirm it. */
    swingLookback: number;
    /** Swing prices within this many pips count as equal highs / equal lows. */
    equalTolerancePips: number;
    /** Structure events inspected when deciding the current trend. */
    trendLookback: number;
    /** Minimum swing points before a trend is asserted. */
    minSwings: number;
  };
  regime: {
    /** ADX at which a market is considered trending. */
    adxTrendThreshold: number;
    /** ADX at which a trend is considered strong. */
    adxStrongTrend: number;
    /** ATR as % of price at which volatility is considered high. */
    highVolatilityAtrPct: number;
    /** ATR as % of price at which volatility is considered low. */
    lowVolatilityAtrPct: number;
    /** Band width vs its lookback average at which a breakout is declared. */
    breakoutBandWidthRatio: number;
    /** Bars of band-width history used as the squeeze baseline. */
    regimeLookback: number;
  };
  bias: {
    /** Weight per scoring component. Section 7 defaults: 35/25/20/20. */
    weights: Record<BiasComponent, number>;
    /** Optional fundamental overlay weight (0 in Phase 1: no provider yet). */
    fundamentalsWeight: number;
    /** |score| at which a bias becomes STRONG. */
    strongThreshold: number;
    /** |score| at which a bias leaves NEUTRAL. */
    biasThreshold: number;
  };
  setup: {
    /** Distance in pips at which price is "approaching" a zone. */
    zoneProximityPips: number;
    /** Fraction of zone width at which a SETUP becomes ARMED. */
    armThresholdRatio: number;
    /** Minimum setup score for the zone to be actionable. */
    minSetupScore: number;
    /** Buffer in pips beyond the zone edge used for invalidation. */
    invalidationBufferPips: number;
    /** Bars of swings/levels considered when building zones. */
    zoneLookback: number;
  };
  trigger: {
    rsiOverbought: number;
    rsiOversold: number;
    /** Lower-wick-to-body ratio required for a bullish rejection candle. */
    rejectionWickRatio: number;
    /** Minimum body-to-range ratio for an engulfing candle. */
    engulfMinBodyRatio: number;
    /** Minimum composite trigger score required to confirm an entry. */
    minTriggerScore: number;
    /** A structural event older than this many bars may not fire a fresh trigger. */
    maxTriggerAgeBars: number;
  };
  risk: {
    /** Hard minimum reward-to-risk. */
    minRR: number;
    /** Risk applied when the caller does not specify one. */
    defaultRiskPercent: number;
    /** Hard maximum risk per trade. */
    maxRiskPercent: number;
    /** Hard minimum risk; below this the trade is not worth the spread. */
    minRiskPercent: number;
    /** Sanity cap on position size, in lots. */
    maxLotSize: number;
    /** R multiple used to project the second take-profit target. */
    tp2RR: number;
    /** Buffer placed in front of confirmed structural target levels. */
    structuralTargetBufferPips: number;
  };
  execution: {
    /** Market data older than this is stale and blocks execution. */
    maxDataAgeMs: number;
    /** Spread wider than this (pips) blocks execution. */
    maxSpreadPips: number;
    /** A signal older than this is expired and must not execute. */
    maxSignalAgeMs: number;
  };
}

export const defaultEngineConfig: EngineConfig = {
  indicators: {
    emaShort: 20,
    emaMid: 50,
    emaLong: 200,
    rsiPeriod: 14,
    atrPeriod: 14,
    adxPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    bollingerPeriod: 20,
    bollingerMultiplier: 2,
  },
  structure: {
    swingLookback: 3,
    equalTolerancePips: 15,
    trendLookback: 4,
    minSwings: 3,
  },
  regime: {
    adxTrendThreshold: 25,
    adxStrongTrend: 40,
    highVolatilityAtrPct: 1.2,
    lowVolatilityAtrPct: 0.4,
    breakoutBandWidthRatio: 1.5,
    regimeLookback: 60,
  },
  bias: {
    weights: {
      structure: 35,
      trend: 25,
      regime: 20,
      momentum: 20,
    },
    fundamentalsWeight: 0,
    strongThreshold: 60,
    biasThreshold: 20,
  },
  setup: {
    zoneProximityPips: 40,
    armThresholdRatio: 0.25,
    minSetupScore: 40,
    invalidationBufferPips: 10,
    zoneLookback: 60,
  },
  trigger: {
    rsiOverbought: 70,
    rsiOversold: 30,
    rejectionWickRatio: 2,
    engulfMinBodyRatio: 0.7,
    minTriggerScore: 80,
    maxTriggerAgeBars: 10,
  },
  risk: {
    minRR: 2.0,
    defaultRiskPercent: 0.5,
    maxRiskPercent: 2.0,
    minRiskPercent: 0.1,
    maxLotSize: 100,
    tp2RR: 3.0,
    structuralTargetBufferPips: 2,
  },
  execution: {
    maxDataAgeMs: 60_000,
    maxSpreadPips: 5,
    maxSignalAgeMs: 3_600_000,
  },
};

/**
 * Deep-merge a partial override onto the defaults.
 *
 * Only objects are merged recursively; primitives and arrays are replaced
 * wholesale, which is the least-surprising behaviour for config overrides.
 */
export function resolveConfig(
  overrides?: DeepPartial<EngineConfig>
): EngineConfig {
  if (!overrides) return defaultEngineConfig;
  return mergeSection(defaultEngineConfig, overrides) as EngineConfig;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function mergeSection<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (override === undefined) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override as object) as Array<keyof T>) {
    const b = base[key];
    const o = (override as Record<keyof T, unknown>)[key];
    out[key as string] =
      isPlainObject(b) && isPlainObject(o)
        ? mergeSection(
            b as Record<string, unknown>,
            o as DeepPartial<Record<string, unknown>>
          )
        : o;
  }
  return out as T;
}
