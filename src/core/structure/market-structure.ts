import type { OHLCV, Direction } from "@/types/market";
import type {
  EngineResult,
  Evidence,
  StructurePoint,
  StructureResultData,
  SwingPoint,
} from "@/types/engine";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import { engineTimestamp } from "@/core/indicators";

/**
 * Market Structure Engine (Section 5 spec).
 *
 * Detects swing points, classifies them into higher highs / higher lows /
 * lower highs / lower lows, then labels break-of-structure and change-of-
 * character events. All sensitivity comes from {@link EngineConfig.structure}
 * - there is no hardcoded global constant.
 *
 * Pure and deterministic: same candles + same config => identical result.
 *
 * Chronology guarantees (audit findings #3 and #4):
 *  - every swing point carries the bar at which it became observable
 *    ({@link SwingPoint.confirmedAtIndex}), because a pivot needs bars on both
 *    sides before anybody can know it exists;
 *  - a structural break is only reported at the bar where both the broken
 *    swing is confirmed AND price has closed beyond it, so a break event can
 *    never influence a decision made on an earlier bar;
 *  - every confirmed break is kept in {@link StructureResultData.breakEvents}.
 *    A break is a historical fact: retracing back inside the broken level does
 *    not erase it from the event history.
 */
export function analyzeStructure(
  candles: OHLCV[],
  configOverrides?: DeepPartial<EngineConfig>,
  /** Pip size of the instrument, used for equal-high/low tolerance. */
  pipSize = 0.0001,
  /** Market time used for the result timestamp, for deterministic replay. */
  marketAsOf?: number
): EngineResult<StructureResultData> {
  const config = resolveConfig(configOverrides);
  const { swingLookback, equalTolerancePips, trendLookback, minSwings } =
    config.structure;

  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];

  const swingHighs = detectSwings(candles, swingLookback, "high");
  const swingLows = detectSwings(candles, swingLookback, "low");
  const swings = [...swingHighs, ...swingLows].sort((a, b) => a.index - b.index);

  // Classify consecutive same-kind swings into HH/HL/LH/LL.
  const points: StructurePoint[] = [];
  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;

  for (const swing of swings) {
    if (swing.kind === "high") {
      if (lastHigh !== null) {
        const type = swing.price > lastHigh.price ? "HH" : "LH";
        points.push(toPoint(type, swing, type === "HH" ? "LONG" : "SHORT"));
      }
      lastHigh = swing;
    } else {
      if (lastLow !== null) {
        const type = swing.price > lastLow.price ? "HL" : "LL";
        points.push(toPoint(type, swing, type === "HL" ? "LONG" : "SHORT"));
      }
      lastLow = swing;
    }
  }

  // Structural breaks. Every swing is tested, so the complete break history is
  // retained rather than only the most recent one.
  const breakEvents = detectBreaks(
    candles,
    swings,
    points,
    trendLookback,
    minSwings
  );
  for (const event of breakEvents) {
    points.push(event);
  }

  // Trend comes from the swing sequence alone. Break events are reported
  // separately as confirmation / reversal evidence: letting alternating breaks
  // vote on the trend would let a choppy range masquerade as a trend.
  const swingPoints = points.filter(
    (point) => point.type !== "BOS" && point.type !== "CHOCH"
  );
  const trend = deriveTrend(swingPoints, trendLookback, minSwings);
  const trendStrength = trendStrengthOf(swingPoints, trendLookback, trend);

  const lastBOS = lastBreak(breakEvents, "BOS");
  const lastCHOCH = lastBreak(breakEvents, "CHOCH");

  evidence.push({
    code: "SWING_COUNT",
    label: "Swing points detected",
    description: `${swingHighs.length} swing highs and ${swingLows.length} swing lows with swing lookback ${swingLookback}.`,
    value: swingHighs.length + swingLows.length,
  });

  const recent = swingPoints.slice(-trendLookback);
  for (const point of recent) {
    evidence.push({
      code: `STRUCTURE_${point.type}`,
      label: `Structure point ${point.type}`,
      description: `${point.type} at index ${point.index}, price ${point.price}. Implies ${point.direction}.`,
      value: point.price,
    });
  }

  if (breakEvents.length > 0) {
    evidence.push({
      code: "BREAK_EVENTS",
      label: "Structural breaks",
      description: `${breakEvents.length} confirmed break events in the series.`,
      value: breakEvents.length,
    });
  }

  if (lastBOS) {
    evidence.push({
      code: "BOS",
      label: "Break of structure",
      description: `Close broke the previous swing ${lastBOS.direction === "LONG" ? "high" : "low"} at ${lastBOS.price} in the direction of the existing trend: continuation.`,
      value: lastBOS.price,
    });
  }
  if (lastCHOCH) {
    evidence.push({
      code: "CHOCH",
      label: "Change of character",
      description: `Close broke the previous swing ${lastCHOCH.direction === "LONG" ? "high" : "low"} at ${lastCHOCH.price} against the existing trend: potential reversal.`,
      value: lastCHOCH.price,
    });
  }

  if (trend === "NEUTRAL") {
    conflicts.push({
      code: "NO_CLEAR_STRUCTURE",
      label: "No clear structure",
      description: `Fewer than ${minSwings} aligned structure points in the last ${trendLookback} events; structure is unclear.`,
      value: countDirectional(points),
    });
  }

  const equalHighs = findEqualLevels(swingHighs, equalTolerancePips * pipSize);
  const equalLows = findEqualLevels(swingLows, equalTolerancePips * pipSize);
  for (const pair of equalHighs) {
    evidence.push({
      code: "EQUAL_HIGH",
      label: "Equal highs",
      description: `Swing highs at ${pair[0].price} and ${pair[1].price} are within ${equalTolerancePips} pips. Resting liquidity often sits above equal highs.`,
      value: pair[0].price,
    });
  }
  for (const pair of equalLows) {
    evidence.push({
      code: "EQUAL_LOW",
      label: "Equal lows",
      description: `Swing lows at ${pair[0].price} and ${pair[1].price} are within ${equalTolerancePips} pips. Resting liquidity often sits below equal lows.`,
      value: pair[0].price,
    });
  }

  const data: StructureResultData = {
    swingHighs,
    swingLows,
    trend,
    lastSwingHigh: lastHigh,
    lastSwingLow: lastLow,
    lastBOS,
    lastCHOCH,
    structurePoints: points,
    trendStrength,
    equalHighs,
    equalLows,
    breakEvents,
  };

  return {
    status: `STRUCTURE_${trend}`,
    score: Math.round(trendStrength),
    evidence,
    conflicts,
    data,
    timestamp: engineTimestamp(marketAsOf),
  };
}

function detectSwings(
  candles: OHLCV[],
  lookback: number,
  kind: "high" | "low"
): SwingPoint[] {
  const out: SwingPoint[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const price = candles[i][kind];
    let isExtreme = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (
        (kind === "high" && candles[j].high >= price) ||
        (kind === "low" && candles[j].low <= price)
      ) {
        isExtreme = false;
        break;
      }
    }
    if (isExtreme) {
      out.push({
        index: i,
        timestamp: candles[i].timestamp,
        price,
        kind,
        confirmedAtIndex: i + lookback,
        confirmedAtTimestamp: candles[Math.min(i + lookback, candles.length - 1)].timestamp,
      });
    }
  }
  return out;
}

function toPoint(
  type: StructurePoint["type"],
  swing: SwingPoint,
  direction: Direction
): StructurePoint {
  return {
    type,
    index: swing.index,
    timestamp: swing.timestamp,
    price: swing.price,
    direction,
    confirmed: false,
    confirmedAtIndex: swing.confirmedAtIndex,
    confirmedAtTimestamp: swing.confirmedAtTimestamp,
  };
}

/**
 * Test every swing for a later close beyond its level and record each one.
 *
 * The event is anchored at the bar where the break became observable: the
 * later of the breaking candle and the confirmation bar of the broken swing.
 * Anchoring it at the breaking candle alone would let a decision made before
 * the swing was even knowable see the event - a look-ahead.
 */
function detectBreaks(
  candles: OHLCV[],
  swings: SwingPoint[],
  swingPoints: StructurePoint[],
  trendLookback: number,
  minSwings: number
): StructurePoint[] {
  const events: StructurePoint[] = [];
  for (const swing of swings) {
    const breakIndex = firstBreakIndex(candles, swing);
    if (breakIndex === -1) continue;
    const eventIndex = Math.max(breakIndex, swing.confirmedAtIndex);
    const breakDirection: Direction = swing.kind === "high" ? "LONG" : "SHORT";
    // Trend established strictly before the break, from swings that were
    // already observable at that bar: with the trend it is continuation,
    // against it it is a change of character.
    const trendBefore = deriveTrend(swingPoints, trendLookback, minSwings, eventIndex);
    const type: StructurePoint["type"] =
      trendBefore === breakDirection ? "BOS" : "CHOCH";
    events.push({
      type,
      index: eventIndex,
      timestamp: candles[eventIndex].timestamp,
      price: swing.price,
      direction: breakDirection,
      confirmed: true,
      confirmedAtIndex: eventIndex,
      confirmedAtTimestamp: candles[eventIndex].timestamp,
    });
  }
  return events.sort((a, b) => a.index - b.index || a.price - b.price);
}

/** Index of the first candle after the pivot that closes beyond its level. */
function firstBreakIndex(candles: OHLCV[], swing: SwingPoint): number {
  for (let i = swing.index + 1; i < candles.length; i++) {
    const beyond =
      swing.kind === "high"
        ? candles[i].close > swing.price
        : candles[i].close < swing.price;
    if (beyond) return i;
  }
  return -1;
}

/** Most recent event of a given type, or null when none occurred. */
function lastBreak(
  events: StructurePoint[],
  type: StructurePoint["type"]
): StructurePoint | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === type) return events[i];
  }
  return null;
}

/**
 * Derive the trend from the most recent structure points.
 *
 * `asOfIndex` restricts the input to points that were observable at that bar,
 * which is what keeps a trend calculation for an early bar from using swings
 * confirmed later.
 */
function deriveTrend(
  points: StructurePoint[],
  lookback: number,
  minSwings: number,
  asOfIndex = Infinity
): Direction {
  const recent = points
    .filter((point) => point.confirmedAtIndex <= asOfIndex)
    .slice(-lookback);
  if (recent.length < minSwings) return "NEUTRAL";
  let longScore = 0;
  let shortScore = 0;
  for (const point of recent) {
    if (point.type === "HH" || point.type === "HL") longScore++;
    if (point.type === "LH" || point.type === "LL") shortScore++;
  }
  if (longScore > shortScore) return "LONG";
  if (shortScore > longScore) return "SHORT";
  return "NEUTRAL";
}

function trendStrengthOf(
  points: StructurePoint[],
  lookback: number,
  trend: Direction
): number {
  const recent = points.slice(-lookback);
  if (recent.length === 0 || trend === "NEUTRAL") return 0;
  let aligned = 0;
  for (const point of recent) {
    const bullish = point.type === "HH" || point.type === "HL";
    const bearish = point.type === "LH" || point.type === "LL";
    if (
      (trend === "LONG" && bullish) ||
      (trend === "SHORT" && bearish)
    ) {
      aligned++;
    }
  }
  return (aligned / recent.length) * 100;
}

function countDirectional(points: StructurePoint[]): number {
  return points.filter(
    (p) =>
      p.type === "HH" || p.type === "HL" || p.type === "LH" || p.type === "LL"
  ).length;
}

/** Pair up swing levels whose prices fall within `tolerance` of each other. */
export function findEqualLevels(
  swings: SwingPoint[],
  tolerance: number
): SwingPoint[][] {
  const pairs: SwingPoint[][] = [];
  for (let i = 0; i < swings.length; i++) {
    for (let j = i + 1; j < swings.length; j++) {
      if (Math.abs(swings[i].price - swings[j].price) <= tolerance) {
        pairs.push([swings[i], swings[j]]);
      }
    }
  }
  return pairs;
}

