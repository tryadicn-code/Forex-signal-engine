import type { Direction } from "@/types/market";
import type { ExecutionPlan } from "@/types/engine";

/**
 * TRD-RR-003: classify the nearest structural obstacle into an ExecutionPlan.
 *
 * Pure function. No side effects, no logging, no throwing. The caller is
 * responsible for supplying validated inputs (entry, stop, direction, config).
 * Degenerate inputs (stopDistance <= 0) fall back to FULL_2R with tp = entry,
 * which the Risk Engine will independently reject as RR_TOO_LOW / INVALID_STOP.
 */
export interface ObstacleClassificationInput {
  entry: number;
  stop: number;
  direction: Direction;
  /** Baseline minimum reward-to-risk; also the FULL_2R target multiple. */
  minRR: number;
  /** Obstacles below this R multiple block the candidate. */
  minObstacleR: number;
  /** Upper bound of the "close 100% at obstacle" tier. */
  closeObstacleMaxR: number;
  /** TP1 allocation for PARTIAL plans, as a percent of the initial size. */
  partialTP1SizePercent: number;
  /**
   * When false, PARTIAL plans downgrade to FULL_2R. Fase B transition flag:
   * paper execution still only understands a single take-profit, so we must
   * never hand it a multi-TP plan it cannot honor.
   */
  partialTPEnabled: boolean;
  /** Nearest obstacle price on the profit side, or undefined when none. */
  obstaclePrice: number | undefined;
}

export function classifyObstacle(
  input: ObstacleClassificationInput
): ExecutionPlan {
  const {
    entry,
    stop,
    direction,
    minRR,
    minObstacleR,
    closeObstacleMaxR,
    partialTP1SizePercent,
    partialTPEnabled,
    obstaclePrice,
  } = input;

  const stopDistance = Math.abs(entry - stop);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) {
    // Degenerate stop: do not classify. Risk Engine rejects independently.
    return { kind: "FULL_2R", tp: entry };
  }

  const long = direction === "LONG";
  const baselineTP = entry + (long ? 1 : -1) * stopDistance * minRR;

  if (
    obstaclePrice === undefined ||
    !Number.isFinite(obstaclePrice) ||
    obstaclePrice <= 0
  ) {
    return { kind: "FULL_2R", tp: baselineTP };
  }

  const signedObstacle = obstaclePrice - entry;
  const correctSide = long ? signedObstacle > 0 : signedObstacle < 0;
  if (!correctSide) {
    // Obstacle on the wrong side is not a valid profit-side target.
    return { kind: "FULL_2R", tp: baselineTP };
  }

  const obstacleR = Math.abs(signedObstacle) / stopDistance;

  if (obstacleR < minObstacleR) {
    return {
      kind: "BLOCK",
      reason: "RR_TOO_LOW_OBSTACLE",
      obstaclePrice,
      obstacleR,
    };
  }

  if (obstacleR >= minRR) {
    return {
      kind: "FULL_2R",
      tp: baselineTP,
      obstaclePrice,
      obstacleR,
    };
  }

  // minObstacleR <= obstacleR < closeObstacleMaxR:
  // close 100% at the obstacle. No partial TP here — the space is too tight
  // for a second leg to be worth it, but the obstacle is real resistance.
  if (obstacleR < closeObstacleMaxR) {
    return {
      kind: "FULL_OBSTACLE",
      tp: obstaclePrice,
      obstaclePrice,
      obstacleR,
    };
  }

  // closeObstacleMaxR <= obstacleR < minRR: PARTIAL when supported,
  // otherwise fall back to FULL_2R so a single-TP paper build stays honest.
  if (!partialTPEnabled) {
    return {
      kind: "FULL_2R",
      tp: baselineTP,
      obstaclePrice,
      obstacleR,
    };
  }

  return {
    kind: "PARTIAL",
    tp1: obstaclePrice,
    tp1SizePercent: partialTP1SizePercent,
    tp2: baselineTP,
    tp2SizePercent: 100 - partialTP1SizePercent,
    obstaclePrice,
    obstacleR,
  };
}