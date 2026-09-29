import { describe, expect, it } from "vitest";
import { HistoricalReplayClock } from "@/replay/replay-clock";

const M15 = 15 * 60_000;
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

describe("HistoricalReplayClock", () => {
  it("advances only on deterministic closed-bar boundaries", () => {
    const clock = new HistoricalReplayClock({
      startAt: T0 + 2 * 60_000,
      endAt: T0 + 47 * 60_000,
      stepTimeframe: "M15",
    });

    expect([...clock]).toEqual([
      T0 + M15,
      T0 + 2 * M15,
      T0 + 3 * M15,
    ]);
    expect(clock.stepCount).toBe(3);
  });

  it("includes an exact boundary and never runs past endAt", () => {
    const clock = new HistoricalReplayClock({
      startAt: T0,
      endAt: T0 + 2 * M15,
      stepTimeframe: "M15",
    });

    expect([...clock]).toEqual([T0, T0 + M15, T0 + 2 * M15]);
  });

  it("rejects reversed ranges", () => {
    expect(
      () =>
        new HistoricalReplayClock({
          startAt: T0 + M15,
          endAt: T0,
        })
    ).toThrow(/endAt/);
  });
});
