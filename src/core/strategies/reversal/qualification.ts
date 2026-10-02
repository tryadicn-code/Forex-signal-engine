import type { Direction, OHLCV } from "@/types/market";
import type {
  RegimeResultData,
  StructurePoint,
  StructureResultData,
  SwingPoint,
} from "@/types/engine";
import { atr, last } from "@/core/indicators";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import {
  DEFAULT_REVERSAL_CONFIG,
  type ReversalConfig,
} from "./config";

export interface ReversalQualification {
  qualified: boolean;
  direction: Direction;
  transition: StructurePoint | null;
  exhaustionSwing: SwingPoint | null;
  exhaustionLevel: number | null;
  sweepIndex: number | null;
  sweepTimestamp: number | null;
  sweepDistanceAtr: number;
  transitionAgeBars: number | null;
  reasonCode:
    | "REVERSAL_QUALIFIED"
    | "REVERSAL_REGIME_REQUIRED"
    | "REVERSAL_CHOCH_MISSING"
    | "REVERSAL_CHOCH_STALE"
    | "REVERSAL_EXHAUSTION_LEVEL_MISSING"
    | "REVERSAL_SWEEP_MISSING";
  reason: string;
}

export interface ReversalQualificationInput {
  candles: OHLCV[];
  structure: StructureResultData;
  regime: RegimeResultData;
  pipSize: number;
  coreConfigOverrides?: DeepPartial<EngineConfig>;
  strategyConfig?: Partial<ReversalConfig>;
}

/**
 * Qualifies reversal routing without predicting a top/bottom.
 *
 * A reversal candidate exists only when:
 *  1. H4 is already HIGH_VOLATILITY;
 *  2. a fresh confirmed CHOCH exists;
 *  3. before that CHOCH, price swept a previously confirmed swing extreme and
 *     closed back through it (exhaustion/liquidity-sweep evidence).
 *
 * The CHOCH provides structural transition; the prior sweep provides the
 * exhaustion context. Either signal alone is insufficient.
 */
export function qualifyReversal(
  input: ReversalQualificationInput
): ReversalQualification {
  const strategy = {
    ...DEFAULT_REVERSAL_CONFIG,
    ...input.strategyConfig,
  };
  const core = resolveConfig(input.coreConfigOverrides);
  const candles = input.candles;
  const lastIndex = candles.length - 1;

  if (input.regime.regime !== "HIGH_VOLATILITY") {
    return fail(
      "REVERSAL_REGIME_REQUIRED",
      `Reversal qualification requires HIGH_VOLATILITY; current regime is ${input.regime.regime}.`
    );
  }

  const transition = input.structure.breakEvents
    .filter(
      (event) =>
        event.confirmed &&
        event.type === "CHOCH" &&
        event.direction !== "NEUTRAL" &&
        event.index <= lastIndex
    )
    .sort((a, b) => b.index - a.index)[0];

  if (!transition) {
    return fail(
      "REVERSAL_CHOCH_MISSING",
      "HIGH_VOLATILITY is present, but no confirmed H4 CHOCH establishes a structural transition."
    );
  }

  if (transition.direction === "NEUTRAL") {
    return fail(
      "REVERSAL_CHOCH_MISSING",
      "Latest CHOCH does not carry a directional transition."
    );
  }
  const reversalDirection = transition.direction;

  const transitionAgeBars = lastIndex - transition.index;
  if (transitionAgeBars > strategy.maxTransitionAgeBars) {
    return {
      ...fail(
        "REVERSAL_CHOCH_STALE",
        `Latest H4 CHOCH is ${transitionAgeBars} bars old; maximum is ${strategy.maxTransitionAgeBars}.`
      ),
      transition,
      direction: reversalDirection,
      transitionAgeBars,
    };
  }

  const exhaustionSwing = referenceExtreme(
    input.structure,
    reversalDirection,
    transition.index
  );
  if (!exhaustionSwing) {
    return {
      ...fail(
        "REVERSAL_EXHAUSTION_LEVEL_MISSING",
        "No previously confirmed H4 swing extreme is available to validate exhaustion before CHOCH."
      ),
      transition,
      direction: reversalDirection,
      transitionAgeBars,
    };
  }

  const from = Math.max(
    exhaustionSwing.confirmedAtIndex,
    transition.index - strategy.maxExhaustionLookbackBars
  );
  const to = transition.index - 1;

  for (let i = to; i >= from; i--) {
    const candle = candles[i];
    if (!candle) continue;
    const atrValue =
      last(atr(candles.slice(0, i + 1), core.indicators.atrPeriod)) ?? 0;
    if (!(atrValue > 0)) continue;

    const minimumSweep = Math.max(
      strategy.minSweepPips * input.pipSize,
      atrValue * strategy.minSweepAtr
    );

    const swept =
      reversalDirection === "SHORT"
        ? candle.high >= exhaustionSwing.price + minimumSweep &&
          candle.close < exhaustionSwing.price
        : candle.low <= exhaustionSwing.price - minimumSweep &&
          candle.close > exhaustionSwing.price;

    if (!swept) continue;

    const sweepDistance =
      reversalDirection === "SHORT"
        ? candle.high - exhaustionSwing.price
        : exhaustionSwing.price - candle.low;

    return {
      qualified: true,
      direction: reversalDirection,
      transition,
      exhaustionSwing,
      exhaustionLevel:
        reversalDirection === "SHORT" ? candle.high : candle.low,
      sweepIndex: i,
      sweepTimestamp: candle.timestamp,
      sweepDistanceAtr: sweepDistance / atrValue,
      transitionAgeBars,
      reasonCode: "REVERSAL_QUALIFIED",
      reason: `Fresh ${reversalDirection} H4 CHOCH followed an exhaustion sweep of confirmed ${exhaustionSwing.kind} ${exhaustionSwing.price}; reversal routing is qualified.`,
    };
  }

  return {
    qualified: false,
    direction: reversalDirection,
    transition,
    exhaustionSwing,
    exhaustionLevel: null,
    sweepIndex: null,
    sweepTimestamp: null,
    sweepDistanceAtr: 0,
    transitionAgeBars,
    reasonCode: "REVERSAL_SWEEP_MISSING",
    reason:
      "A fresh H4 CHOCH exists, but no pre-transition sweep-and-close-back of a confirmed swing extreme was found.",
  };
}

function referenceExtreme(
  structure: StructureResultData,
  reversalDirection: Exclude<Direction, "NEUTRAL">,
  transitionIndex: number
): SwingPoint | null {
  const candidates =
    reversalDirection === "SHORT"
      ? structure.swingHighs
      : structure.swingLows;

  return (
    candidates
      .filter(
        (swing) =>
          swing.confirmedAtIndex <= transitionIndex &&
          swing.index < transitionIndex
      )
      .sort((a, b) => b.index - a.index)[0] ?? null
  );
}

function fail(
  reasonCode: ReversalQualification["reasonCode"],
  reason: string
): ReversalQualification {
  return {
    qualified: false,
    direction: "NEUTRAL",
    transition: null,
    exhaustionSwing: null,
    exhaustionLevel: null,
    sweepIndex: null,
    sweepTimestamp: null,
    sweepDistanceAtr: 0,
    transitionAgeBars: null,
    reasonCode,
    reason,
  };
}
