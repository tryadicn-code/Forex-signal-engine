import type { Direction, OHLCV } from "@/types/market";
import type {
  BiasResultData,
  EngineResult,
  Evidence,
  RegimeResultData,
  SetupResultData,
  StructurePoint,
  StructureResultData,
} from "@/types/engine";
import { atr, engineTimestamp, last } from "@/core/indicators";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import {
  DEFAULT_BREAKOUT_RETEST_CONFIG,
  type BreakoutRetestConfig,
} from "./config";

export interface BreakoutReference {
  direction: Exclude<Direction, "NEUTRAL">;
  eventType: "BOS" | "CHOCH";
  level: number;
  eventIndex: number;
  eventTimestamp: number;
  ageInBars: number;
  breakDistanceAtr: number;
}

export interface BreakoutRetestSetupAnalysis {
  result: EngineResult<SetupResultData>;
  breakout: BreakoutReference | null;
  retestTimestamp: number | null;
  retestAgeInBars: number | null;
}

export interface BreakoutRetestSetupInput {
  setupCandles: OHLCV[];
  triggerCandles: OHLCV[];
  setupStructure: StructureResultData;
  regime: RegimeResultData;
  bias: BiasResultData;
  pipSize: number;
  coreConfigOverrides?: DeepPartial<EngineConfig>;
  strategyConfig?: Partial<BreakoutRetestConfig>;
  marketAsOf?: number;
}

/**
 * Builds a strategy-specific zone around the most recent confirmed H1 break.
 *
 * It does not chase the breakout candle. A breakout becomes actionable only
 * when M15 comes back toward the broken level; ARMED requires a retest that
 * sweeps the level zone and closes back on the breakout side.
 */
export function analyzeBreakoutRetestSetup(
  input: BreakoutRetestSetupInput
): BreakoutRetestSetupAnalysis {
  const strategy = {
    ...DEFAULT_BREAKOUT_RETEST_CONFIG,
    ...input.strategyConfig,
  };
  const core = resolveConfig(input.coreConfigOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const direction = input.bias.direction;
  const empty = (): BreakoutRetestSetupAnalysis => ({
    result: {
      status: "SETUP_NONE",
      score: 0,
      evidence,
      conflicts,
      data: emptySetup(),
      timestamp: engineTimestamp(input.marketAsOf),
    },
    breakout: null,
    retestTimestamp: null,
    retestAgeInBars: null,
  });

  if (input.regime.regime !== "BREAKOUT") {
    evidence.push({
      code: "BREAKOUT_REGIME_REQUIRED",
      label: "Breakout regime required",
      description: `BREAKOUT_RETEST is inactive while regime is ${input.regime.regime}.`,
      value: input.regime.regime,
    });
    return empty();
  }

  if (direction === "NEUTRAL") {
    evidence.push({
      code: "BREAKOUT_DIRECTION_UNRESOLVED",
      label: "Directional bias unresolved",
      description: "A breakout retest is not traded until the directional bias clears its threshold.",
    });
    return empty();
  }

  const breakout = findBreakoutReference(
    input.setupCandles,
    input.setupStructure,
    direction,
    core,
    strategy
  );

  if (breakout === null) {
    evidence.push({
      code: "BREAKOUT_LEVEL_NOT_CONFIRMED",
      label: "No fresh confirmed breakout level",
      description:
        "No sufficiently expansive, direction-aligned confirmed H1 break is fresh enough for a retest setup.",
    });
    return empty();
  }

  const atrAtBreak =
    last(
      atr(
        input.setupCandles.slice(0, breakout.eventIndex + 1),
        core.indicators.atrPeriod
      )
    ) ?? 0;
  const zoneHalfWidth = Math.max(
    strategy.zoneBufferPips * input.pipSize,
    atrAtBreak * strategy.zoneBufferAtr
  );
  const zoneLow = breakout.level - zoneHalfWidth;
  const zoneHigh = breakout.level + zoneHalfWidth;
  const long = direction === "LONG";
  const invalidationLevel = long
    ? zoneLow - strategy.invalidationBufferPips * input.pipSize
    : zoneHigh + strategy.invalidationBufferPips * input.pipSize;

  evidence.push({
    code: "BREAKOUT_LEVEL",
    label: "Confirmed breakout level",
    description: `${breakout.eventType} ${direction} broke ${breakout.level}; event age ${breakout.ageInBars} H1 bars, displacement ${breakout.breakDistanceAtr.toFixed(2)} ATR.`,
    value: breakout.level,
  });
  evidence.push({
    code: "BREAKOUT_RETEST_ZONE",
    label: "Retest zone",
    description: `Broken level is monitored as [${zoneLow}, ${zoneHigh}] with invalidation at ${invalidationLevel}.`,
    value: breakout.level,
  });

  const current =
    input.triggerCandles[input.triggerCandles.length - 1] ??
    input.setupCandles[input.setupCandles.length - 1];
  if (!current) return empty();

  const invalidated = long
    ? current.close < invalidationLevel
    : current.close > invalidationLevel;
  if (invalidated) {
    conflicts.push({
      code: "BREAKOUT_RETEST_INVALIDATED",
      label: "Broken level failed",
      description: `Close ${current.close} moved through invalidation ${invalidationLevel}; the breakout level did not hold.`,
      value: current.close,
    });
    return {
      result: makeResult(
        "INVALIDATED",
        0,
        zoneLow,
        zoneHigh,
        invalidationLevel,
        0,
        evidence,
        conflicts,
        input.marketAsOf
      ),
      breakout,
      retestTimestamp: null,
      retestAgeInBars: null,
    };
  }

  const recentRetest = findRecentRetestHold(
    input.triggerCandles,
    zoneLow,
    zoneHigh,
    direction,
    breakout.eventTimestamp,
    strategy.maxRetestAgeBars
  );

  const inside =
    current.close >= zoneLow && current.close <= zoneHigh;
  const swept = long
    ? current.low <= zoneHigh && current.high >= zoneLow
    : current.high >= zoneLow && current.low <= zoneHigh;
  const distancePips = distanceFromZone(
    current.close,
    zoneLow,
    zoneHigh,
    direction,
    input.pipSize
  );

  let state: SetupResultData["state"];
  if (recentRetest !== null) {
    state = "ARMED";
    evidence.push({
      code: "BREAKOUT_RETEST_HELD",
      label: "Retest held",
      description: `M15 retested the broken level and closed back on the ${direction} side ${recentRetest.ageInBars} bar(s) ago.`,
      value: recentRetest.timestamp,
    });
  } else if (
    inside ||
    swept ||
    distancePips <= strategy.retestProximityPips
  ) {
    state = "SETUP";
    evidence.push({
      code: "BREAKOUT_RETEST_ACTIVE",
      label: "Retest zone active",
      description: inside || swept
        ? "Price is interacting with the broken-level retest zone; a hold and structural resumption are still required."
        : `Price is ${distancePips.toFixed(1)} pips from the retest zone.`,
      value: distancePips,
    });
  } else {
    state = "WATCH";
    const extended = distancePips > strategy.maxChaseDistancePips;
    evidence.push({
      code: extended
        ? "BREAKOUT_NO_CHASE"
        : "BREAKOUT_WAITING_FOR_RETEST",
      label: extended ? "Do not chase breakout" : "Waiting for retest",
      description: extended
        ? `Price is ${distancePips.toFixed(1)} pips from the broken level, beyond the ${strategy.maxChaseDistancePips}-pip chase limit.`
        : `Breakout is valid but price has not returned within the ${strategy.retestProximityPips}-pip retest window.`,
      value: distancePips,
    });
  }

  const freshnessScore = Math.max(
    0,
    20 * (1 - breakout.ageInBars / Math.max(1, strategy.maxBreakoutAgeBars))
  );
  const displacementScore = Math.min(
    30,
    30 * (breakout.breakDistanceAtr / Math.max(strategy.minBreakoutCloseAtr, 0.01))
  );
  const proximityScore =
    recentRetest !== null
      ? 30
      : Math.max(
          0,
          30 *
            (1 -
              distancePips /
                Math.max(1, strategy.maxChaseDistancePips))
        );
  const holdScore = recentRetest !== null ? 20 : 0;
  const setupScore = Math.min(
    100,
    Math.round(freshnessScore + displacementScore + proximityScore + holdScore)
  );

  if (
    (state === "SETUP" || state === "ARMED") &&
    setupScore < strategy.minSetupScore
  ) {
    state = "WATCH";
    evidence.push({
      code: "BREAKOUT_SETUP_SCORE_TOO_LOW",
      label: "Breakout setup score below minimum",
      description: `Score ${setupScore} is below the ${strategy.minSetupScore} breakout-retest minimum.`,
      value: setupScore,
    });
  }

  return {
    result: makeResult(
      state,
      setupScore,
      zoneLow,
      zoneHigh,
      invalidationLevel,
      distancePips,
      evidence,
      conflicts,
      input.marketAsOf
    ),
    breakout,
    retestTimestamp: recentRetest?.timestamp ?? null,
    retestAgeInBars: recentRetest?.ageInBars ?? null,
  };
}

function findBreakoutReference(
  candles: OHLCV[],
  structure: StructureResultData,
  direction: Exclude<Direction, "NEUTRAL">,
  core: EngineConfig,
  strategy: BreakoutRetestConfig
): BreakoutReference | null {
  const lastIndex = candles.length - 1;
  const candidates = structure.breakEvents
    .filter(
      (event): event is StructurePoint & { type: "BOS" | "CHOCH" } =>
        event.confirmed &&
        (event.type === "BOS" || event.type === "CHOCH") &&
        event.direction === direction &&
        event.index <= lastIndex
    )
    .sort((a, b) => b.index - a.index);

  for (const event of candidates) {
    const ageInBars = lastIndex - event.index;
    if (ageInBars > strategy.maxBreakoutAgeBars) continue;
    const breakCandle = candles[event.index];
    if (!breakCandle) continue;

    const atrAtBreak =
      last(
        atr(
          candles.slice(0, event.index + 1),
          core.indicators.atrPeriod
        )
      ) ?? 0;
    if (!(atrAtBreak > 0)) continue;

    const displacement =
      direction === "LONG"
        ? breakCandle.close - event.price
        : event.price - breakCandle.close;
    const breakDistanceAtr = displacement / atrAtBreak;

    if (
      displacement > 0 &&
      breakDistanceAtr >= strategy.minBreakoutCloseAtr
    ) {
      return {
        direction,
        eventType: event.type,
        level: event.price,
        eventIndex: event.index,
        eventTimestamp: event.confirmedAtTimestamp,
        ageInBars,
        breakDistanceAtr,
      };
    }
  }

  return null;
}

function findRecentRetestHold(
  candles: OHLCV[],
  zoneLow: number,
  zoneHigh: number,
  direction: Exclude<Direction, "NEUTRAL">,
  breakoutTimestamp: number,
  maxAgeBars: number
): { index: number; timestamp: number; ageInBars: number } | null {
  const lastIndex = candles.length - 1;
  const from = Math.max(0, lastIndex - maxAgeBars);

  for (let i = lastIndex; i >= from; i--) {
    const candle = candles[i];
    if (!candle || candle.timestamp <= breakoutTimestamp) continue;
    const swept =
      candle.low <= zoneHigh && candle.high >= zoneLow;
    const held =
      direction === "LONG"
        ? candle.close > zoneHigh && candle.close > candle.open
        : candle.close < zoneLow && candle.close < candle.open;
    if (swept && held) {
      return {
        index: i,
        timestamp: candle.timestamp,
        ageInBars: lastIndex - i,
      };
    }
  }

  return null;
}

function distanceFromZone(
  price: number,
  zoneLow: number,
  zoneHigh: number,
  direction: Exclude<Direction, "NEUTRAL">,
  pipSize: number
): number {
  if (price >= zoneLow && price <= zoneHigh) return 0;
  const distance =
    direction === "LONG"
      ? Math.max(0, price - zoneHigh)
      : Math.max(0, zoneLow - price);
  return pipSize > 0 ? distance / pipSize : 0;
}

function emptySetup(): SetupResultData {
  return {
    state: "NONE",
    zoneLow: 0,
    zoneHigh: 0,
    distanceToZone: 0,
    setupType: "breakout-retest",
    setupScore: 0,
    invalidationLevel: 0,
    zoneSource: "broken-structure-level",
  };
}

function makeResult(
  state: SetupResultData["state"],
  score: number,
  zoneLow: number,
  zoneHigh: number,
  invalidationLevel: number,
  distanceToZone: number,
  evidence: Evidence[],
  conflicts: Evidence[],
  marketAsOf?: number
): EngineResult<SetupResultData> {
  return {
    status: `SETUP_${state}`,
    score,
    evidence,
    conflicts,
    data: {
      state,
      zoneLow,
      zoneHigh,
      distanceToZone: Math.round(distanceToZone * 10) / 10,
      setupType: "breakout-retest",
      setupScore: score,
      invalidationLevel,
      zoneSource: "broken-structure-level",
    },
    timestamp: engineTimestamp(marketAsOf),
  };
}
