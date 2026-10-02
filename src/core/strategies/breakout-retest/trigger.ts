import type { Direction, OHLCV } from "@/types/market";
import type {
  EngineResult,
  Evidence,
  SetupResultData,
  StructureResultData,
  TriggerBreakdown,
  TriggerComponentState,
  TriggerResultData,
} from "@/types/engine";
import { engineTimestamp, last, macd, rsi } from "@/core/indicators";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import {
  DEFAULT_BREAKOUT_RETEST_CONFIG,
  type BreakoutRetestConfig,
} from "./config";
import type { BreakoutReference } from "./setup";

const SCORE_STRUCTURAL = 50;
const SCORE_LOCATION = 30;
const SCORE_CANDLE = 10;
const SCORE_MOMENTUM = 10;

export interface BreakoutRetestTriggerInput {
  candles: OHLCV[];
  setup: SetupResultData;
  structure: StructureResultData;
  direction: Exclude<Direction, "NEUTRAL">;
  breakout: BreakoutReference;
  coreConfigOverrides?: DeepPartial<EngineConfig>;
  strategyConfig?: Partial<BreakoutRetestConfig>;
  marketAsOf?: number;
}

/**
 * Breakout-specific trigger.
 *
 * Mandatory:
 *  1. a retest-hold of the broken H1 level after the breakout;
 *  2. fresh M15 structural resumption in the breakout direction after retest.
 *
 * Optional candle quality / momentum provide the final 10 points needed by the
 * default 90-point threshold. This prevents breakout chasing and prevents a
 * pre-breakout M15 BOS from being recycled as confirmation.
 */
export function evaluateBreakoutRetestTrigger(
  input: BreakoutRetestTriggerInput
): EngineResult<TriggerResultData> {
  const strategy = {
    ...DEFAULT_BREAKOUT_RETEST_CONFIG,
    ...input.strategyConfig,
  };
  const core = resolveConfig(input.coreConfigOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const candles = input.candles;
  const lastIndex = candles.length - 1;
  const current = candles[lastIndex];

  const location = detectRecentRetest(
    candles,
    input.setup,
    input.direction,
    input.breakout.eventTimestamp,
    strategy.maxRetestAgeBars
  );
  const structural = detectPostRetestStructure(
    input.structure,
    input.direction,
    candles,
    location.timestamp,
    input.breakout.eventTimestamp,
    strategy.maxConfirmationAgeBars
  );
  const candle = detectRetestCandleQuality(
    candles,
    location,
    input.direction,
    core,
    strategy
  );
  const momentum = momentumReadings(candles, input.direction, core);

  const score = Math.min(
    100,
    (structural.fired ? SCORE_STRUCTURAL : 0) +
      (location.fired ? SCORE_LOCATION : 0) +
      (candle.fired ? SCORE_CANDLE : 0) +
      (momentum.aligned ? SCORE_MOMENTUM : 0)
  );

  const breakdown: TriggerBreakdown = {
    structural,
    location,
    candle,
    momentum,
    score,
  };

  if (!current) {
    return result(
      "WAITING",
      breakdown,
      null,
      null,
      null,
      null,
      evidence,
      conflicts,
      input.marketAsOf
    );
  }

  const invalidated =
    input.direction === "LONG"
      ? current.close < input.setup.invalidationLevel
      : current.close > input.setup.invalidationLevel;

  if (invalidated) {
    conflicts.push({
      code: "BREAKOUT_RETEST_INVALIDATED",
      label: "Retest invalidated",
      description: `Close ${current.close} crossed breakout invalidation ${input.setup.invalidationLevel}.`,
      value: current.close,
    });
    return result(
      "INVALIDATED",
      breakdown,
      null,
      null,
      null,
      null,
      evidence,
      conflicts,
      input.marketAsOf
    );
  }

  evidence.push(componentEvidence("BREAKOUT_RETEST", "Retest location", location));
  evidence.push(componentEvidence("BREAKOUT_RESUMPTION", "Structural resumption", structural));
  evidence.push(componentEvidence("BREAKOUT_CANDLE", "Retest candle quality", candle));
  evidence.push({
    code: momentum.aligned
      ? "BREAKOUT_MOMENTUM_ALIGNED"
      : "BREAKOUT_MOMENTUM_MISS",
    label: "Momentum",
    description: `RSI ${momentum.rsi.toFixed(1)} and MACD histogram ${momentum.macdHistogram.toFixed(5)} are${momentum.aligned ? "" : " not"} aligned with ${input.direction}.`,
    value: momentum.aligned,
  });
  evidence.push({
    code: "BREAKOUT_TRIGGER_SCORE",
    label: "Breakout trigger score",
    description: `Score ${score}/100; mandatory retest + post-retest structure, minimum ${strategy.minTriggerScore}.`,
    value: score,
  });

  const confirmed =
    location.fired &&
    structural.fired &&
    score >= strategy.minTriggerScore;

  if (!location.fired) {
    conflicts.push({
      code: "BREAKOUT_RETEST_NOT_HELD",
      label: "Retest hold missing",
      description:
        "No recent post-breakout candle swept the broken level and closed back on the breakout side.",
    });
  }
  if (!structural.fired) {
    conflicts.push({
      code: "BREAKOUT_RESUMPTION_MISSING",
      label: "Structural resumption missing",
      description:
        "Retest exists but no fresh M15 BOS/CHOCH in the breakout direction occurred after the retest.",
    });
  }
  if (
    location.fired &&
    structural.fired &&
    score < strategy.minTriggerScore
  ) {
    conflicts.push({
      code: "BREAKOUT_CONFIRMATION_INCOMPLETE",
      label: "Optional confirmation missing",
      description: `Mandatory components passed but score ${score} is below ${strategy.minTriggerScore}; candle quality or momentum confirmation is still required.`,
      value: score,
    });
  }

  if (!confirmed) {
    return result(
      "WAITING",
      breakdown,
      null,
      null,
      null,
      null,
      evidence,
      conflicts,
      input.marketAsOf
    );
  }

  const firedIndexes = [location.index, structural.index, candle.fired ? candle.index : null]
    .filter((value): value is number => value !== null);
  const triggerIndex = Math.max(...firedIndexes);
  const triggerTimestamp = candles[triggerIndex]?.timestamp ?? null;
  const ageInBars =
    triggerTimestamp === null ? null : lastIndex - triggerIndex;

  return result(
    "CONFIRMED",
    breakdown,
    `BREAKOUT_RETEST+${structural.name}`,
    triggerIndex,
    triggerTimestamp,
    ageInBars,
    evidence,
    conflicts,
    input.marketAsOf
  );
}

function detectRecentRetest(
  candles: OHLCV[],
  setup: SetupResultData,
  direction: Exclude<Direction, "NEUTRAL">,
  breakoutTimestamp: number,
  maxAgeBars: number
): TriggerComponentState {
  const lastIndex = candles.length - 1;
  const from = Math.max(0, lastIndex - maxAgeBars);

  for (let i = lastIndex; i >= from; i--) {
    const candle = candles[i];
    if (!candle || candle.timestamp <= breakoutTimestamp) continue;
    const swept =
      candle.low <= setup.zoneHigh && candle.high >= setup.zoneLow;
    const held =
      direction === "LONG"
        ? candle.close > setup.zoneHigh && candle.close > candle.open
        : candle.close < setup.zoneLow && candle.close < candle.open;
    if (swept && held) {
      return {
        name: "RETEST_HOLD",
        fired: true,
        index: i,
        timestamp: candle.timestamp,
      };
    }
  }

  return {
    name: null,
    fired: false,
    index: null,
    timestamp: null,
  };
}

function detectPostRetestStructure(
  structure: StructureResultData,
  direction: Exclude<Direction, "NEUTRAL">,
  candles: OHLCV[],
  retestTimestamp: number | null,
  breakoutTimestamp: number,
  maxAgeBars: number
): TriggerComponentState {
  if (retestTimestamp === null) {
    return { name: null, fired: false, index: null, timestamp: null };
  }

  const lastIndex = candles.length - 1;
  const events = structure.breakEvents
    .filter(
      (event) =>
        event.confirmed &&
        event.direction === direction &&
        event.confirmedAtTimestamp >= retestTimestamp &&
        event.confirmedAtTimestamp > breakoutTimestamp &&
        lastIndex - event.index <= maxAgeBars
    )
    .sort((a, b) => b.index - a.index);

  const event = events[0];
  if (!event) {
    return { name: null, fired: false, index: null, timestamp: null };
  }

  return {
    name: event.type,
    fired: true,
    index: event.index,
    timestamp: event.confirmedAtTimestamp,
  };
}

function detectRetestCandleQuality(
  candles: OHLCV[],
  location: TriggerComponentState,
  direction: Exclude<Direction, "NEUTRAL">,
  core: EngineConfig,
  strategy: BreakoutRetestConfig
): TriggerComponentState {
  if (!location.fired || location.index === null) {
    return { name: null, fired: false, index: null, timestamp: null };
  }
  const candle = candles[location.index];
  if (!candle) {
    return { name: null, fired: false, index: null, timestamp: null };
  }

  const range = Math.max(candle.high - candle.low, 1e-9);
  const body = Math.abs(candle.close - candle.open);
  const bodyRatio = body / range;
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const rejectionWick = direction === "LONG" ? lowerWick : upperWick;
  const wickRatio = rejectionWick / Math.max(body, 1e-9);
  const fired =
    bodyRatio >= strategy.minRetestBodyRatio ||
    wickRatio >= core.trigger.rejectionWickRatio;

  return {
    name: fired ? "RETEST_REJECTION" : null,
    fired,
    index: fired ? location.index : null,
    timestamp: fired ? candle.timestamp : null,
  };
}

function momentumReadings(
  candles: OHLCV[],
  direction: Exclude<Direction, "NEUTRAL">,
  config: EngineConfig
): { rsi: number; macdHistogram: number; aligned: boolean } {
  const rsiValue = last(rsi(candles, config.indicators.rsiPeriod)) ?? 50;
  const prices = candles.map((c) => c.close);
  const macdResult = macd(
    prices,
    config.indicators.macdFast,
    config.indicators.macdSlow,
    config.indicators.macdSignal
  );
  const histogram = last(macdResult.histogram) ?? 0;
  const aligned =
    direction === "LONG"
      ? rsiValue >= 50 && histogram >= 0
      : rsiValue <= 50 && histogram <= 0;
  return { rsi: rsiValue, macdHistogram: histogram, aligned };
}

function componentEvidence(
  code: string,
  label: string,
  component: TriggerComponentState
): Evidence {
  return {
    code: component.fired ? `${code}_PASS` : `${code}_MISS`,
    label,
    description: component.fired
      ? `${component.name} confirmed at trigger bar ${component.index}.`
      : `${label} is not confirmed.`,
    value: component.name ?? undefined,
  };
}

function result(
  state: TriggerResultData["state"],
  breakdown: TriggerBreakdown,
  triggerType: string | null,
  triggerIndex: number | null,
  triggerTimestamp: number | null,
  ageInBars: number | null,
  evidence: Evidence[],
  conflicts: Evidence[],
  marketAsOf?: number
): EngineResult<TriggerResultData> {
  return {
    status: `TRIGGER_${state}`,
    score: state === "CONFIRMED" ? breakdown.score : 0,
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
    timestamp: engineTimestamp(marketAsOf),
  };
}
