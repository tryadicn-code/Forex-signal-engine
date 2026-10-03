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
  DEFAULT_RANGE_MEAN_REVERSION_CONFIG,
  type RangeMeanReversionConfig,
} from "./config";
import type { RangeContext } from "./setup";

const SCORE_LOCATION = 40;
const SCORE_STRUCTURAL = 30;
const SCORE_CANDLE = 20;
const SCORE_MOMENTUM = 10;

export interface RangeMeanReversionTriggerInput {
  candles: OHLCV[];
  setup: SetupResultData;
  range: RangeContext;
  structure: StructureResultData;
  direction: Exclude<Direction, "NEUTRAL">;
  coreConfigOverrides?: DeepPartial<EngineConfig>;
  strategyConfig?: Partial<RangeMeanReversionConfig>;
  marketAsOf?: number;
}

/**
 * Confirms mean reversion only after the boundary rejects price and M15
 * structure turns back into the range. A mere touch or oscillator extreme can
 * never confirm an entry.
 */
export function evaluateRangeMeanReversionTrigger(
  input: RangeMeanReversionTriggerInput
): EngineResult<TriggerResultData> {
  const strategy = {
    ...DEFAULT_RANGE_MEAN_REVERSION_CONFIG,
    ...input.strategyConfig,
  };
  const core = resolveConfig(input.coreConfigOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const candles = input.candles;
  const lastIndex = candles.length - 1;
  const current = candles[lastIndex];

  const location = detectBoundaryRejection(
    candles,
    input.setup,
    input.direction,
    strategy.maxRejectionAgeBars
  );
  const structural = detectPostRejectionStructure(
    input.structure,
    input.direction,
    candles,
    location.timestamp,
    strategy.maxConfirmationAgeBars
  );
  const candle = rejectionQuality(
    candles,
    location,
    input.direction,
    strategy
  );
  const momentum = meanReversionMomentum(candles, input.direction, core);

  const score = Math.min(
    100,
    (location.fired ? SCORE_LOCATION : 0) +
      (structural.fired ? SCORE_STRUCTURAL : 0) +
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
      code: "RANGE_BOUNDARY_INVALIDATED",
      label: "Range boundary invalidated",
      description: `Close ${current.close} crossed invalidation ${input.setup.invalidationLevel}; mean-reversion thesis is invalid.`,
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

  evidence.push(componentEvidence("RANGE_BOUNDARY_REJECTION", "Boundary rejection", location));
  evidence.push(componentEvidence("RANGE_STRUCTURE_TURN", "Post-rejection structure", structural));
  evidence.push(componentEvidence("RANGE_REJECTION_CANDLE", "Rejection candle quality", candle));
  evidence.push({
    code: momentum.aligned
      ? "RANGE_MOMENTUM_TURN"
      : "RANGE_MOMENTUM_MISS",
    label: "Mean-reversion momentum",
    description: `RSI ${momentum.rsi.toFixed(1)} and MACD histogram ${momentum.macdHistogram.toFixed(5)} are${momentum.aligned ? "" : " not"} turning toward the range mean for ${input.direction}.`,
    value: momentum.aligned,
  });
  evidence.push({
    code: "RANGE_TRIGGER_SCORE",
    label: "Range trigger score",
    description: `Score ${score}/100; boundary rejection + post-rejection structure + rejection candle are mandatory, minimum ${strategy.minTriggerScore}.`,
    value: score,
  });

  const confirmed =
    location.fired &&
    structural.fired &&
    candle.fired &&
    score >= strategy.minTriggerScore;

  if (!location.fired) {
    conflicts.push({
      code: "RANGE_BOUNDARY_REJECTION_MISSING",
      label: "Boundary rejection missing",
      description:
        "No recent M15 candle touched the active range boundary and closed back inside the range.",
    });
  }
  if (location.fired && !candle.fired) {
    conflicts.push({
      code: "RANGE_REJECTION_QUALITY_LOW",
      label: "Rejection candle quality insufficient",
      description:
        "Boundary was touched, but the rejection candle lacks sufficient wick/body confirmation.",
    });
  }
  if (location.fired && !structural.fired) {
    conflicts.push({
      code: "RANGE_STRUCTURE_TURN_MISSING",
      label: "Post-rejection structure missing",
      description:
        "Boundary rejection occurred, but no fresh M15 BOS/CHOCH back toward the range mean followed it.",
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

  const indexes = [location.index, structural.index, candle.index]
    .filter((value): value is number => value !== null);
  const triggerIndex = Math.max(...indexes);
  const triggerTimestamp = candles[triggerIndex]?.timestamp ?? null;
  const ageInBars =
    triggerTimestamp === null ? null : lastIndex - triggerIndex;

  return result(
    "CONFIRMED",
    breakdown,
    `RANGE_REJECTION+${structural.name}`,
    triggerIndex,
    triggerTimestamp,
    ageInBars,
    evidence,
    conflicts,
    input.marketAsOf
  );
}

function detectBoundaryRejection(
  candles: OHLCV[],
  setup: SetupResultData,
  direction: Exclude<Direction, "NEUTRAL">,
  maxAgeBars: number
): TriggerComponentState {
  const lastIndex = candles.length - 1;
  const from = Math.max(0, lastIndex - maxAgeBars);

  for (let i = lastIndex; i >= from; i--) {
    const candle = candles[i];
    if (!candle) continue;
    const touched =
      candle.low <= setup.zoneHigh && candle.high >= setup.zoneLow;
    const closedInside =
      direction === "LONG"
        ? candle.close > setup.zoneHigh
        : candle.close < setup.zoneLow;
    if (touched && closedInside) {
      return {
        name:
          direction === "LONG"
            ? "LOWER_BOUNDARY_REJECTION"
            : "UPPER_BOUNDARY_REJECTION",
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

function detectPostRejectionStructure(
  structure: StructureResultData,
  direction: Exclude<Direction, "NEUTRAL">,
  candles: OHLCV[],
  rejectionTimestamp: number | null,
  maxAgeBars: number
): TriggerComponentState {
  if (rejectionTimestamp === null) {
    return { name: null, fired: false, index: null, timestamp: null };
  }

  const lastIndex = candles.length - 1;
  const event = structure.breakEvents
    .filter(
      (candidate) =>
        candidate.confirmed &&
        candidate.direction === direction &&
        candidate.confirmedAtTimestamp >= rejectionTimestamp &&
        lastIndex - candidate.index <= maxAgeBars
    )
    .sort((a, b) => b.index - a.index)[0];

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

function rejectionQuality(
  candles: OHLCV[],
  location: TriggerComponentState,
  direction: Exclude<Direction, "NEUTRAL">,
  config: RangeMeanReversionConfig
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
  const wick =
    direction === "LONG"
      ? Math.min(candle.open, candle.close) - candle.low
      : candle.high - Math.max(candle.open, candle.close);
  const wickRatio = wick / Math.max(body, 1e-9);
  const directionalBody =
    direction === "LONG"
      ? candle.close > candle.open
      : candle.close < candle.open;
  const fired =
    directionalBody &&
    (bodyRatio >= config.minRejectionBodyRatio ||
      wickRatio >= config.rejectionWickRatio);

  return {
    name: fired ? "BOUNDARY_REJECTION_CANDLE" : null,
    fired,
    index: fired ? location.index : null,
    timestamp: fired ? candle.timestamp : null,
  };
}

function meanReversionMomentum(
  candles: OHLCV[],
  direction: Exclude<Direction, "NEUTRAL">,
  config: EngineConfig
): { rsi: number; macdHistogram: number; aligned: boolean } {
  const rsiSeries = rsi(candles, config.indicators.rsiPeriod);
  const currentRsi = last(rsiSeries) ?? 50;
  const previousRsi =
    rsiSeries.length > 1
      ? rsiSeries[rsiSeries.length - 2] ?? currentRsi
      : currentRsi;
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
      ? currentRsi > previousRsi && currentRsi >= 45 && histogram >= 0
      : currentRsi < previousRsi && currentRsi <= 55 && histogram <= 0;

  return {
    rsi: currentRsi,
    macdHistogram: histogram,
    aligned,
  };
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
      ? `${component.name} confirmed at M15 bar ${component.index}.`
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
