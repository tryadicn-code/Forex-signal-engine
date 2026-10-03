import type {
  BiasResultData,
  EngineResult,
  Evidence,
  RegimeResultData,
  SetupResultData,
  StructureResultData,
  SwingPoint,
} from "@/types/engine";
import type { Direction, OHLCV } from "@/types/market";
import { atr, engineTimestamp, last } from "@/core/indicators";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import {
  DEFAULT_RANGE_MEAN_REVERSION_CONFIG,
  type RangeMeanReversionConfig,
} from "./config";

export interface RangeContext {
  lowerBoundary: number;
  upperBoundary: number;
  midpoint: number;
  width: number;
  widthPips: number;
  widthAtr: number;
  lowerTouches: number;
  upperTouches: number;
  direction: Direction;
  zoneLow: number;
  zoneHigh: number;
}

export interface RangeMeanReversionSetupAnalysis {
  setup: EngineResult<SetupResultData>;
  bias: EngineResult<BiasResultData>;
  range: RangeContext | null;
}

export interface RangeMeanReversionSetupInput {
  setupCandles: OHLCV[];
  setupStructure: StructureResultData;
  regime: RegimeResultData;
  pipSize: number;
  coreConfigOverrides?: DeepPartial<EngineConfig>;
  strategyConfig?: Partial<RangeMeanReversionConfig>;
  marketAsOf?: number;
}

/**
 * Validates a horizontal range from repeated confirmed H1 swing clusters and
 * derives trade direction exclusively from location:
 *   lower boundary -> LONG mean reversion
 *   upper boundary -> SHORT mean reversion
 *   middle of range -> NEUTRAL / WAIT
 */
export function analyzeRangeMeanReversionSetup(
  input: RangeMeanReversionSetupInput
): RangeMeanReversionSetupAnalysis {
  const strategy = {
    ...DEFAULT_RANGE_MEAN_REVERSION_CONFIG,
    ...input.strategyConfig,
  };
  const core = resolveConfig(input.coreConfigOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const timestamp = engineTimestamp(input.marketAsOf);
  const neutralBias = rangeBias("NEUTRAL", 0, [], [], input.marketAsOf);

  const none = (
    code: string,
    label: string,
    description: string
  ): RangeMeanReversionSetupAnalysis => {
    evidence.push({ code, label, description });
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
        timestamp,
        null
      ),
      bias: neutralBias,
      range: null,
    };
  };

  if (input.regime.regime !== "RANGE") {
    return none(
      "RANGE_REGIME_REQUIRED",
      "Range regime required",
      `RANGE_MEAN_REVERSION is inactive while regime is ${input.regime.regime}.`
    );
  }

  const atrValue =
    last(atr(input.setupCandles, core.indicators.atrPeriod)) ?? 0;
  if (!(atrValue > 0) || !(input.pipSize > 0)) {
    return none(
      "RANGE_VOLATILITY_UNAVAILABLE",
      "Range volatility unavailable",
      "ATR or pip metadata is unavailable, so range width cannot be validated safely."
    );
  }

  const minIndex = Math.max(0, input.setupCandles.length - strategy.lookbackBars);
  const confirmedLows = input.setupStructure.swingLows.filter(
    (swing) =>
      swing.confirmedAtIndex < input.setupCandles.length &&
      swing.index >= minIndex
  );
  const confirmedHighs = input.setupStructure.swingHighs.filter(
    (swing) =>
      swing.confirmedAtIndex < input.setupCandles.length &&
      swing.index >= minIndex
  );

  const tolerance = Math.max(
    strategy.boundaryTolerancePips * input.pipSize,
    atrValue * strategy.boundaryToleranceAtr
  );
  const lower = bestBoundaryCluster(
    confirmedLows,
    tolerance,
    strategy.minTouchesPerBoundary
  );
  const upper = bestBoundaryCluster(
    confirmedHighs,
    tolerance,
    strategy.minTouchesPerBoundary
  );

  if (lower === null || upper === null) {
    return none(
      "RANGE_BOUNDARIES_UNCONFIRMED",
      "Range boundaries unconfirmed",
      `Need at least ${strategy.minTouchesPerBoundary} confirmed H1 swing touches at both range boundaries.`
    );
  }

  const lowerBoundary = lower.level;
  const upperBoundary = upper.level;
  const width = upperBoundary - lowerBoundary;
  const widthPips = width / input.pipSize;
  const widthAtr = width / atrValue;

  if (!(width > 0) || widthPips < strategy.minRangeWidthPips) {
    return none(
      "RANGE_TOO_NARROW",
      "Range too narrow",
      `Validated boundaries are only ${widthPips.toFixed(1)} pips apart; minimum is ${strategy.minRangeWidthPips} pips.`
    );
  }
  if (widthAtr > strategy.maxRangeWidthAtr) {
    return none(
      "RANGE_TOO_WIDE",
      "Range too wide",
      `Range width is ${widthAtr.toFixed(2)} ATR, above the ${strategy.maxRangeWidthAtr}-ATR limit.`
    );
  }

  const price =
    input.setupCandles[input.setupCandles.length - 1]?.close ?? 0;
  const midpoint = (lowerBoundary + upperBoundary) / 2;
  const invalidationBuffer =
    strategy.invalidationBufferPips * input.pipSize;

  if (
    price < lowerBoundary - invalidationBuffer ||
    price > upperBoundary + invalidationBuffer
  ) {
    conflicts.push({
      code: "RANGE_BREAKOUT_DETECTED",
      label: "Range boundary failed",
      description: `Close ${price} is outside validated range [${lowerBoundary}, ${upperBoundary}] beyond the invalidation buffer.`,
      value: price,
    });
    return {
      setup: setupResult(
        "INVALIDATED",
        0,
        lowerBoundary,
        upperBoundary,
        0,
        0,
        evidence,
        conflicts,
        timestamp,
        Math.max(lower.latestIndex, upper.latestIndex) >= 0
          ? input.setupCandles[
              Math.max(lower.latestIndex, upper.latestIndex)
            ]?.timestamp ?? null
          : null
      ),
      bias: neutralBias,
      range: {
        lowerBoundary,
        upperBoundary,
        midpoint,
        width,
        widthPips,
        widthAtr,
        lowerTouches: lower.touches,
        upperTouches: upper.touches,
        direction: "NEUTRAL",
        zoneLow: lowerBoundary,
        zoneHigh: upperBoundary,
      },
    };
  }

  const distanceLowerPips =
    Math.abs(price - lowerBoundary) / input.pipSize;
  const distanceUpperPips =
    Math.abs(upperBoundary - price) / input.pipSize;
  const nearLower =
    distanceLowerPips <= strategy.boundaryProximityPips;
  const nearUpper =
    distanceUpperPips <= strategy.boundaryProximityPips;

  let direction: Direction = "NEUTRAL";
  if (nearLower && !nearUpper) direction = "LONG";
  if (nearUpper && !nearLower) direction = "SHORT";

  const zoneHalfWidth = Math.max(
    strategy.entryZonePips * input.pipSize,
    atrValue * strategy.entryZoneAtr
  );
  const boundary =
    direction === "LONG"
      ? lowerBoundary
      : direction === "SHORT"
        ? upperBoundary
        : midpoint;
  const zoneLow = boundary - zoneHalfWidth;
  const zoneHigh = boundary + zoneHalfWidth;

  evidence.push({
    code: "RANGE_BOUNDARIES_CONFIRMED",
    label: "Horizontal range validated",
    description: `Lower ${lowerBoundary} (${lower.touches} touches), upper ${upperBoundary} (${upper.touches} touches), width ${widthPips.toFixed(1)} pips / ${widthAtr.toFixed(2)} ATR.`,
    value: widthPips,
  });

  if (direction === "NEUTRAL") {
    evidence.push({
      code: "RANGE_MIDPOINT_WAIT",
      label: "Price is not at an edge",
      description: `Price ${price} is between the tradeable boundary zones. Mean reversion does not enter from the middle of a range.`,
      value: price,
    });
    const range: RangeContext = {
      lowerBoundary,
      upperBoundary,
      midpoint,
      width,
      widthPips,
      widthAtr,
      lowerTouches: lower.touches,
      upperTouches: upper.touches,
      direction,
      zoneLow,
      zoneHigh,
    };
    return {
      setup: setupResult(
        "WATCH",
        rangeQuality(lower.touches, upper.touches, widthAtr, strategy),
        zoneLow,
        zoneHigh,
        0,
        Math.min(distanceLowerPips, distanceUpperPips),
        evidence,
        conflicts,
        timestamp,
        Math.max(lower.latestIndex, upper.latestIndex) >= 0
          ? input.setupCandles[
              Math.max(lower.latestIndex, upper.latestIndex)
            ]?.timestamp ?? null
          : null
      ),
      bias: neutralBias,
      range,
    };
  }

  const score = rangeQuality(
    lower.touches,
    upper.touches,
    widthAtr,
    strategy
  );
  const invalidationLevel =
    direction === "LONG"
      ? lowerBoundary - invalidationBuffer
      : upperBoundary + invalidationBuffer;
  const state: SetupResultData["state"] =
    score >= strategy.minSetupScore ? "SETUP" : "WATCH";

  if (score < strategy.minSetupScore) {
    evidence.push({
      code: "RANGE_SETUP_SCORE_TOO_LOW",
      label: "Range setup quality below minimum",
      description: `Range quality ${score} is below the ${strategy.minSetupScore} minimum.`,
      value: score,
    });
  }

  evidence.push({
    code:
      direction === "LONG"
        ? "RANGE_LOWER_BOUNDARY_ACTIVE"
        : "RANGE_UPPER_BOUNDARY_ACTIVE",
    label:
      direction === "LONG"
        ? "Lower range boundary active"
        : "Upper range boundary active",
    description:
      direction === "LONG"
        ? `Price is ${distanceLowerPips.toFixed(1)} pips from range support; evaluate LONG mean reversion toward midpoint ${midpoint}.`
        : `Price is ${distanceUpperPips.toFixed(1)} pips from range resistance; evaluate SHORT mean reversion toward midpoint ${midpoint}.`,
    value: boundary,
  });

  const biasEvidence: Evidence[] = [{
    code: "RANGE_LOCATION_BIAS",
    label: "Boundary-derived mean-reversion direction",
    description:
      direction === "LONG"
        ? "Direction is LONG because price is at the validated lower range boundary; trend-following bias is intentionally not used."
        : "Direction is SHORT because price is at the validated upper range boundary; trend-following bias is intentionally not used.",
    value: direction,
  }];

  const range: RangeContext = {
    lowerBoundary,
    upperBoundary,
    midpoint,
    width,
    widthPips,
    widthAtr,
    lowerTouches: lower.touches,
    upperTouches: upper.touches,
    direction,
    zoneLow,
    zoneHigh,
  };

  return {
    setup: setupResult(
      state,
      score,
      zoneLow,
      zoneHigh,
      invalidationLevel,
      direction === "LONG" ? distanceLowerPips : distanceUpperPips,
      evidence,
      conflicts,
      timestamp,
      Math.max(lower.latestIndex, upper.latestIndex) >= 0
          ? input.setupCandles[
              Math.max(lower.latestIndex, upper.latestIndex)
            ]?.timestamp ?? null
          : null
    ),
    bias: rangeBias(
      direction,
      direction === "LONG" ? 50 : -50,
      biasEvidence,
      [],
      input.marketAsOf
    ),
    range,
  };
}

function bestBoundaryCluster(
  swings: SwingPoint[],
  tolerance: number,
  minTouches: number
): { level: number; touches: number; latestIndex: number } | null {
  let best: { level: number; touches: number; latestIndex: number } | null = null;

  for (const anchor of swings) {
    const members = swings.filter(
      (candidate) => Math.abs(candidate.price - anchor.price) <= tolerance
    );
    if (members.length < minTouches) continue;
    const level =
      members.reduce((sum, member) => sum + member.price, 0) / members.length;
    const latestIndex = Math.max(...members.map((member) => member.index));
    if (
      best === null ||
      members.length > best.touches ||
      (members.length === best.touches && latestIndex > best.latestIndex)
    ) {
      best = {
        level,
        touches: members.length,
        latestIndex,
      };
    }
  }

  return best;
}

function rangeQuality(
  lowerTouches: number,
  upperTouches: number,
  widthAtr: number,
  config: RangeMeanReversionConfig
): number {
  const touchScore = Math.min(
    60,
    (Math.min(lowerTouches, 3) + Math.min(upperTouches, 3)) * 10
  );
  const widthScore =
    widthAtr >= 2 && widthAtr <= 8
      ? 30
      : widthAtr >= 1.5 && widthAtr <= config.maxRangeWidthAtr
        ? 20
        : 10;
  const balancePenalty =
    Math.abs(lowerTouches - upperTouches) * 5;
  return Math.max(
    0,
    Math.min(100, 10 + touchScore + widthScore - balancePenalty)
  );
}

function rangeBias(
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
      // Legacy component slots are intentionally zero: this strategy's bias is
      // location-derived, not a re-labeled trend/momentum weighted sum.
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
  timestamp: string,
  setupOriginTimestamp: number | null = null
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
      setupType: "range-mean-reversion",
      setupScore: score,
      invalidationLevel,
      zoneSource: "validated-range-boundary",
      setupOriginTimestamp,
    },
    timestamp,
  };
}
