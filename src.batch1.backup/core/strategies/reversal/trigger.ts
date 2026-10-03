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
  DEFAULT_REVERSAL_CONFIG,
  type ReversalConfig,
} from "./config";
import type { ReversalQualification } from "./qualification";

const SCORE_LOCATION = 35;
const SCORE_STRUCTURAL = 35;
const SCORE_CANDLE = 20;
const SCORE_MOMENTUM = 10;

export interface ReversalTriggerInput {
  candles: OHLCV[];
  setup: SetupResultData;
  structure: StructureResultData;
  direction: Exclude<Direction, "NEUTRAL">;
  qualification: ReversalQualification;
  coreConfigOverrides?: DeepPartial<EngineConfig>;
  strategyConfig?: Partial<ReversalConfig>;
  marketAsOf?: number;
}

/**
 * Confirms reversal only after the qualified H4 transition is retested and M15
 * prints fresh structure in the new direction. Rejection-candle quality is
 * mandatory; momentum can add confidence but cannot replace structure/location.
 */
export function evaluateReversalTrigger(
  input: ReversalTriggerInput
): EngineResult<TriggerResultData> {
  const strategy = {
    ...DEFAULT_REVERSAL_CONFIG,
    ...input.strategyConfig,
  };
  const core = resolveConfig(input.coreConfigOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const candles = input.candles;
  const lastIndex = candles.length - 1;
  const current = candles[lastIndex];
  const transitionTimestamp =
    input.qualification.transition?.confirmedAtTimestamp ?? Number.POSITIVE_INFINITY;

  const location = detectTransitionRetest(
    candles,
    input.setup,
    input.direction,
    transitionTimestamp,
    strategy.maxRetestAgeBars
  );
  const structural = detectPostRetestStructure(
    input.structure,
    input.direction,
    candles,
    location.timestamp,
    transitionTimestamp,
    strategy.maxConfirmationAgeBars
  );
  const candle = rejectionQuality(
    candles,
    location,
    input.direction,
    strategy
  );
  const momentum = reversalMomentum(candles, input.direction, core);

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
    input.direction === "SHORT"
      ? current.close > input.setup.invalidationLevel
      : current.close < input.setup.invalidationLevel;

  if (invalidated) {
    conflicts.push({
      code: "REVERSAL_TRANSITION_INVALIDATED",
      label: "Reversal transition invalidated",
      description: `Close ${current.close} crossed reversal invalidation ${input.setup.invalidationLevel}.`,
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

  evidence.push(componentEvidence("REVERSAL_RETEST", "Transition retest", location));
  evidence.push(componentEvidence("REVERSAL_STRUCTURE_TURN", "Post-retest structure", structural));
  evidence.push(componentEvidence("REVERSAL_REJECTION_CANDLE", "Reversal candle quality", candle));
  evidence.push({
    code: momentum.aligned
      ? "REVERSAL_MOMENTUM_TURN"
      : "REVERSAL_MOMENTUM_MISS",
    label: "Reversal momentum",
    description: `RSI ${momentum.rsi.toFixed(1)} and MACD histogram ${momentum.macdHistogram.toFixed(5)} are${momentum.aligned ? "" : " not"} turning with the new ${input.direction} direction.`,
    value: momentum.aligned,
  });
  evidence.push({
    code: "REVERSAL_TRIGGER_SCORE",
    label: "Reversal trigger score",
    description: `Score ${score}/100; retest + fresh structure + rejection candle are mandatory, minimum ${strategy.minTriggerScore}.`,
    value: score,
  });

  const confirmed =
    location.fired &&
    structural.fired &&
    candle.fired &&
    score >= strategy.minTriggerScore;

  if (!location.fired) {
    conflicts.push({
      code: "REVERSAL_RETEST_MISSING",
      label: "Transition retest missing",
      description:
        "No recent M15 candle revisited the H4 CHOCH zone and closed back on the reversal side.",
    });
  }
  if (location.fired && !candle.fired) {
    conflicts.push({
      code: "REVERSAL_REJECTION_QUALITY_LOW",
      label: "Reversal rejection quality insufficient",
      description:
        "The transition level was touched, but the rejection candle lacks sufficient directional body/wick quality.",
    });
  }
  if (location.fired && !structural.fired) {
    conflicts.push({
      code: "REVERSAL_STRUCTURE_TURN_MISSING",
      label: "Fresh reversal structure missing",
      description:
        "Transition retest occurred, but no fresh M15 BOS/CHOCH in the reversal direction followed it.",
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
    `REVERSAL_RETEST+${structural.name}`,
    triggerIndex,
    triggerTimestamp,
    ageInBars,
    evidence,
    conflicts,
    input.marketAsOf
  );
}

function detectTransitionRetest(
  candles: OHLCV[],
  setup: SetupResultData,
  direction: Exclude<Direction, "NEUTRAL">,
  transitionTimestamp: number,
  maxAgeBars: number
): TriggerComponentState {
  const lastIndex = candles.length - 1;
  const from = Math.max(0, lastIndex - maxAgeBars);

  for (let i = lastIndex; i >= from; i--) {
    const candle = candles[i];
    if (!candle || candle.timestamp <= transitionTimestamp) continue;
    const touched =
      candle.low <= setup.zoneHigh && candle.high >= setup.zoneLow;
    const held =
      direction === "SHORT"
        ? candle.close < setup.zoneLow && candle.close < candle.open
        : candle.close > setup.zoneHigh && candle.close > candle.open;
    if (touched && held) {
      return {
        name: "TRANSITION_RETEST",
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
  transitionTimestamp: number,
  maxAgeBars: number
): TriggerComponentState {
  if (retestTimestamp === null) {
    return { name: null, fired: false, index: null, timestamp: null };
  }

  const lastIndex = candles.length - 1;
  const event = structure.breakEvents
    .filter(
      (candidate) =>
        candidate.confirmed &&
        candidate.direction === direction &&
        candidate.confirmedAtTimestamp >= retestTimestamp &&
        candidate.confirmedAtTimestamp > transitionTimestamp &&
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
  config: ReversalConfig
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
    direction === "SHORT"
      ? candle.high - Math.max(candle.open, candle.close)
      : Math.min(candle.open, candle.close) - candle.low;
  const wickRatio = wick / Math.max(body, 1e-9);
  const directionalBody =
    direction === "SHORT"
      ? candle.close < candle.open
      : candle.close > candle.open;
  const fired =
    directionalBody &&
    (bodyRatio >= config.minRejectionBodyRatio ||
      wickRatio >= config.rejectionWickRatio);

  return {
    name: fired ? "REVERSAL_REJECTION" : null,
    fired,
    index: fired ? location.index : null,
    timestamp: fired ? candle.timestamp : null,
  };
}

function reversalMomentum(
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
    direction === "SHORT"
      ? currentRsi < previousRsi && currentRsi <= 55 && histogram <= 0
      : currentRsi > previousRsi && currentRsi >= 45 && histogram >= 0;

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
