import type {
  BiasResultData,
  EngineResult,
  Evidence,
  SetupResultData,
} from "@/types/engine";
import type { Direction, OHLCV } from "@/types/market";
import { atr, engineTimestamp, last } from "@/core/indicators";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import {
  DEFAULT_REVERSAL_CONFIG,
  type ReversalConfig,
} from "./config";
import type { ReversalQualification } from "./qualification";

export interface ReversalSetupAnalysis {
  setup: EngineResult<SetupResultData>;
  bias: EngineResult<BiasResultData>;
  retestTimestamp: number | null;
  retestAgeInBars: number | null;
}

export interface ReversalSetupInput {
  setupCandles: OHLCV[];
  triggerCandles: OHLCV[];
  qualification: ReversalQualification;
  pipSize: number;
  coreConfigOverrides?: DeepPartial<EngineConfig>;
  strategyConfig?: Partial<ReversalConfig>;
  marketAsOf?: number;
}

/**
 * Converts a qualified H4 reversal transition into a retest setup.
 *
 * The transition CHOCH level is never traded immediately. Price must revisit
 * that level from the new side, while invalidation remains beyond the original
 * exhaustion extreme. Extended price is WATCH/no-chase, not a market entry.
 */
export function analyzeReversalSetup(
  input: ReversalSetupInput
): ReversalSetupAnalysis {
  const strategy = {
    ...DEFAULT_REVERSAL_CONFIG,
    ...input.strategyConfig,
  };
  const core = resolveConfig(input.coreConfigOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const timestamp = engineTimestamp(input.marketAsOf);
  const q = input.qualification;

  if (
    !q.qualified ||
    q.direction === "NEUTRAL" ||
    q.transition === null ||
    q.exhaustionLevel === null
  ) {
    evidence.push({
      code: q.reasonCode,
      label: "Reversal qualification unavailable",
      description: q.reason,
    });
    return {
      setup: setupResult(
        "NONE",
        0,
        0,
        0,
        0,
        0,
        evidence,
        conflicts,
        timestamp
      ),
      bias: reversalBias("NEUTRAL", 0, [], [], input.marketAsOf),
      retestTimestamp: null,
      retestAgeInBars: null,
    };
  }

  const atrValue =
    last(atr(input.setupCandles, core.indicators.atrPeriod)) ?? 0;
  if (!(atrValue > 0) || !(input.pipSize > 0)) {
    evidence.push({
      code: "REVERSAL_VOLATILITY_UNAVAILABLE",
      label: "Reversal volatility unavailable",
      description:
        "ATR or pip metadata is unavailable, so the transition zone cannot be sized safely.",
    });
    return {
      setup: setupResult(
        "NONE",
        0,
        0,
        0,
        0,
        0,
        evidence,
        conflicts,
        timestamp
      ),
      bias: reversalBias("NEUTRAL", 0, [], [], input.marketAsOf),
      retestTimestamp: null,
      retestAgeInBars: null,
    };
  }

  const direction = q.direction as Exclude<Direction, "NEUTRAL">;
  const zoneHalfWidth = Math.max(
    strategy.transitionZonePips * input.pipSize,
    atrValue * strategy.transitionZoneAtr
  );
  const zoneLow = q.transition.price - zoneHalfWidth;
  const zoneHigh = q.transition.price + zoneHalfWidth;
  const invalidationLevel =
    direction === "SHORT"
      ? q.exhaustionLevel + strategy.invalidationBufferPips * input.pipSize
      : q.exhaustionLevel - strategy.invalidationBufferPips * input.pipSize;

  const current =
    input.triggerCandles[input.triggerCandles.length - 1] ??
    input.setupCandles[input.setupCandles.length - 1];

  if (!current) {
    return {
      setup: setupResult(
        "NONE",
        0,
        zoneLow,
        zoneHigh,
        invalidationLevel,
        0,
        evidence,
        conflicts,
        timestamp
      ),
      bias: reversalBias("NEUTRAL", 0, [], [], input.marketAsOf),
      retestTimestamp: null,
      retestAgeInBars: null,
    };
  }

  const invalidated =
    direction === "SHORT"
      ? current.close > invalidationLevel
      : current.close < invalidationLevel;

  if (invalidated) {
    conflicts.push({
      code: "REVERSAL_EXHAUSTION_INVALIDATED",
      label: "Exhaustion extreme invalidated",
      description: `Close ${current.close} crossed reversal invalidation ${invalidationLevel} beyond the exhaustion extreme.`,
      value: current.close,
    });
    return {
      setup: setupResult(
        "INVALIDATED",
        0,
        zoneLow,
        zoneHigh,
        invalidationLevel,
        0,
        evidence,
        conflicts,
        timestamp
      ),
      bias: reversalBias(direction, directionalScore(direction), [], conflicts, input.marketAsOf),
      retestTimestamp: null,
      retestAgeInBars: null,
    };
  }

  const retest = findRecentTransitionRetest(
    input.triggerCandles,
    zoneLow,
    zoneHigh,
    direction,
    q.transition.confirmedAtTimestamp,
    strategy.maxRetestAgeBars
  );
  const touchedNow =
    current.low <= zoneHigh && current.high >= zoneLow;
  const inside =
    current.close >= zoneLow && current.close <= zoneHigh;
  const distancePips = distanceFromZone(
    current.close,
    zoneLow,
    zoneHigh,
    input.pipSize
  );

  let state: SetupResultData["state"];
  if (retest !== null) {
    state = "ARMED";
    evidence.push({
      code: "REVERSAL_TRANSITION_RETEST_HELD",
      label: "Transition retest held",
      description: `M15 revisited the H4 CHOCH level and closed back on the ${direction} side ${retest.ageInBars} bar(s) ago.`,
      value: retest.timestamp,
    });
  } else if (
    inside ||
    touchedNow ||
    distancePips <= strategy.transitionProximityPips
  ) {
    state = "SETUP";
    evidence.push({
      code: "REVERSAL_TRANSITION_ZONE_ACTIVE",
      label: "Transition zone active",
      description: inside || touchedNow
        ? "Price is interacting with the H4 CHOCH transition zone; rejection and fresh lower-timeframe structure are still required."
        : `Price is ${distancePips.toFixed(1)} pips from the transition zone.`,
      value: distancePips,
    });
  } else {
    state = "WATCH";
    const noChase = distancePips > strategy.maxChaseDistancePips;
    evidence.push({
      code: noChase
        ? "REVERSAL_NO_CHASE"
        : "REVERSAL_WAITING_FOR_RETEST",
      label: noChase ? "Do not chase reversal" : "Waiting for transition retest",
      description: noChase
        ? `Price is ${distancePips.toFixed(1)} pips from the H4 transition level, beyond the ${strategy.maxChaseDistancePips}-pip chase limit.`
        : `Qualified reversal is waiting for price to revisit the H4 transition zone within ${strategy.transitionProximityPips} pips.`,
      value: distancePips,
    });
  }

  const freshnessScore = Math.max(
    0,
    30 *
      (1 -
        (q.transitionAgeBars ?? strategy.maxTransitionAgeBars) /
          Math.max(1, strategy.maxTransitionAgeBars))
  );
  const sweepScore = Math.min(
    30,
    30 * (q.sweepDistanceAtr / Math.max(strategy.minSweepAtr, 0.01))
  );
  const retestScore =
    retest !== null
      ? 40
      : Math.max(
          0,
          40 *
            (1 -
              distancePips /
                Math.max(1, strategy.maxChaseDistancePips))
        );
  const score = Math.min(
    100,
    Math.round(freshnessScore + sweepScore + retestScore)
  );

  if (
    (state === "SETUP" || state === "ARMED") &&
    score < strategy.minSetupScore
  ) {
    state = "WATCH";
    evidence.push({
      code: "REVERSAL_SETUP_SCORE_TOO_LOW",
      label: "Reversal setup score below minimum",
      description: `Score ${score} is below the ${strategy.minSetupScore} reversal minimum.`,
      value: score,
    });
  }

  evidence.push({
    code: "REVERSAL_QUALIFIED_TRANSITION",
    label: "Qualified exhaustion transition",
    description: q.reason,
    value: q.transition.price,
  });
  evidence.push({
    code: "REVERSAL_TRANSITION_ZONE",
    label: "CHOCH transition zone",
    description: `Transition level ${q.transition.price} is monitored as [${zoneLow}, ${zoneHigh}], invalidation ${invalidationLevel}.`,
    value: q.transition.price,
  });

  const biasEvidence: Evidence[] = [{
    code: "REVERSAL_TRANSITION_BIAS",
    label: "Transition-derived reversal direction",
    description: `Direction ${direction} comes from the confirmed H4 CHOCH after exhaustion; trend-following bias is intentionally not reused.`,
    value: direction,
  }];

  return {
    setup: setupResult(
      state,
      score,
      zoneLow,
      zoneHigh,
      invalidationLevel,
      distancePips,
      evidence,
      conflicts,
      timestamp
    ),
    bias: reversalBias(
      direction,
      directionalScore(direction),
      biasEvidence,
      [],
      input.marketAsOf
    ),
    retestTimestamp: retest?.timestamp ?? null,
    retestAgeInBars: retest?.ageInBars ?? null,
  };
}

function findRecentTransitionRetest(
  candles: OHLCV[],
  zoneLow: number,
  zoneHigh: number,
  direction: Exclude<Direction, "NEUTRAL">,
  transitionTimestamp: number,
  maxAgeBars: number
): { index: number; timestamp: number; ageInBars: number } | null {
  const lastIndex = candles.length - 1;
  const from = Math.max(0, lastIndex - maxAgeBars);

  for (let i = lastIndex; i >= from; i--) {
    const candle = candles[i];
    if (!candle || candle.timestamp <= transitionTimestamp) continue;
    const touched = candle.low <= zoneHigh && candle.high >= zoneLow;
    const held =
      direction === "SHORT"
        ? candle.close < zoneLow && candle.close < candle.open
        : candle.close > zoneHigh && candle.close > candle.open;
    if (touched && held) {
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
  pipSize: number
): number {
  if (price >= zoneLow && price <= zoneHigh) return 0;
  const distance =
    price < zoneLow ? zoneLow - price : price - zoneHigh;
  return pipSize > 0 ? distance / pipSize : 0;
}

function directionalScore(
  direction: Exclude<Direction, "NEUTRAL">
): number {
  return direction === "LONG" ? 65 : -65;
}

function reversalBias(
  direction: Direction,
  score: number,
  evidence: Evidence[],
  conflicts: Evidence[],
  marketAsOf?: number
): EngineResult<BiasResultData> {
  const label =
    direction === "LONG"
      ? "LONG"
      : direction === "SHORT"
        ? "SHORT"
        : "NEUTRAL";
  return {
    status: `BIAS_${label}`,
    score: Math.abs(score),
    confidence: Math.abs(score),
    evidence,
    conflicts,
    data: {
      label,
      direction,
      score,
      components: {
        structure: 0,
        trend: 0,
        regime: 0,
        momentum: 0,
      },
      weights: {
        structure: 0,
        trend: 0,
        regime: 0,
        momentum: 0,
      },
    },
    timestamp: engineTimestamp(marketAsOf),
  };
}

function setupResult(
  state: SetupResultData["state"],
  score: number,
  zoneLow: number,
  zoneHigh: number,
  invalidationLevel: number,
  distanceToZone: number,
  evidence: Evidence[],
  conflicts: Evidence[],
  timestamp: string
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
      setupType: "reversal-transition-retest",
      setupScore: score,
      invalidationLevel,
      zoneSource: "h4-choch-transition",
    },
    timestamp,
  };
}
