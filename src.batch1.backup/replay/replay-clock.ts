import { intervalMs } from "@/market-data/timeframe";
import type { Timeframe } from "@/types/market";

/**
 * Deterministic market-time clock for historical replay.
 *
 * A replay step is an `asOf` boundary. At that instant providers may expose
 * only candles whose close time is <= asOf.
 */
export class HistoricalReplayClock implements Iterable<number> {
  readonly startAt: number;
  readonly endAt: number;
  readonly stepTimeframe: Timeframe;
  readonly stepMs: number;

  constructor(input: {
    startAt: number;
    endAt: number;
    stepTimeframe?: Timeframe;
  }) {
    const { startAt, endAt, stepTimeframe = "M15" } = input;

    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
      throw new Error("Replay clock boundaries must be finite UTC epoch milliseconds.");
    }
    if (endAt < startAt) {
      throw new Error("Replay endAt must be greater than or equal to startAt.");
    }

    this.startAt = startAt;
    this.endAt = endAt;
    this.stepTimeframe = stepTimeframe;
    this.stepMs = intervalMs(stepTimeframe);
  }

  get firstStepAt(): number | null {
    const first = Math.ceil(this.startAt / this.stepMs) * this.stepMs;
    return first <= this.endAt ? first : null;
  }

  get stepCount(): number {
    const first = this.firstStepAt;
    if (first === null) return 0;
    return Math.floor((this.endAt - first) / this.stepMs) + 1;
  }

  *[Symbol.iterator](): Iterator<number> {
    const first = this.firstStepAt;
    if (first === null) return;

    for (let asOf = first; asOf <= this.endAt; asOf += this.stepMs) {
      yield asOf;
    }
  }
}
