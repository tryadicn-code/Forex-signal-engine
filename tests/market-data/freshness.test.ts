import { describe, it, expect } from "vitest";
import {
  classifyFreshness,
  rollupFreshness,
  timeframeFreshness,
  type FreshnessInput,
} from "@/market-data/freshness";
import { DEFAULT_FRESHNESS_THRESHOLDS } from "@/config/scanner";
import { candleCloseTime, intervalMs } from "@/market-data/timeframe";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function mk(newestCandleTimestamp: number | undefined, timeframe: "M15" | "D1" = "M15"): FreshnessInput {
  return {
    source: "mock",
    timeframe,
    newestCandleTimestamp,
    receivedAt: T0,
    thresholds: DEFAULT_FRESHNESS_THRESHOLDS,
  };
}

describe("classifyFreshness", () => {
  it("is FRESH within the fresh-bar window", () => {
    const bar = intervalMs("M15");
    expect(classifyFreshness(0, "M15", DEFAULT_FRESHNESS_THRESHOLDS)).toBe("FRESH");
    expect(classifyFreshness(bar, "M15", DEFAULT_FRESHNESS_THRESHOLDS)).toBe("FRESH");
  });

  it("is DELAYED past fresh but within the delayed window", () => {
    const bar = intervalMs("M15");
    expect(classifyFreshness(bar * 2, "M15", DEFAULT_FRESHNESS_THRESHOLDS)).toBe("DELAYED");
    expect(classifyFreshness(bar * 4, "M15", DEFAULT_FRESHNESS_THRESHOLDS)).toBe("DELAYED");
  });

  it("is STALE beyond the delayed window", () => {
    const bar = intervalMs("M15");
    expect(classifyFreshness(bar * 5, "M15", DEFAULT_FRESHNESS_THRESHOLDS)).toBe("STALE");
  });

  it("applies thresholds relative to the timeframe, not absolute ms", () => {
    const day = intervalMs("D1");
    // A D1 bar that is half a bar old is FRESH; the same age in M15 bars is far
    // past the M15 window. Thresholds are bar-relative by design.
    expect(classifyFreshness(day * 0.5, "D1", DEFAULT_FRESHNESS_THRESHOLDS)).toBe("FRESH");
    expect(classifyFreshness(day * 0.5, "M15", DEFAULT_FRESHNESS_THRESHOLDS)).toBe("STALE");
  });
});

describe("timeframeFreshness", () => {
  it("is FRESH for a current candle", () => {
    const bar = intervalMs("M15");
    const newestOpen = T0 - bar; // candle closed exactly at T0
    const f = timeframeFreshness(mk(newestOpen));
    expect(f.status).toBe("FRESH");
    expect(f.missing).toBe(false);
    expect(f.marketTimestamp).toBe(candleCloseTime("M15", newestOpen));
    expect(f.ageMs).toBe(0);
  });

  it("is DELAYED for an aged candle", () => {
    const bar = intervalMs("M15");
    const f = timeframeFreshness(mk(T0 - 3 * bar));
    expect(f.status).toBe("DELAYED");
    expect(f.missing).toBe(false);
  });

  it("is STALE for an old candle", () => {
    const bar = intervalMs("M15");
    const f = timeframeFreshness(mk(T0 - 8 * bar));
    expect(f.status).toBe("STALE");
    expect(f.missing).toBe(false);
  });

  // P0 regression: no candles must never read as FRESH.
  it("is explicitly STALE when there is no newest candle", () => {
    const f = timeframeFreshness(mk(undefined));
    expect(f.status).toBe("STALE");
    expect(f.missing).toBe(true);
    expect(f.marketTimestamp).toBeNull();
    expect(Number.isFinite(f.ageMs)).toBe(false);
  });

  it("does not fake a market timestamp equal to receivedAt", () => {
    const f = timeframeFreshness(mk(undefined));
    // The interrupted implementation set marketTimestamp = receivedAt, which
    // collapsed the age to 0 and reported FRESH. Absence must stay observable.
    expect(f.marketTimestamp).not.toBe(T0);
    expect(f.ageMs).not.toBe(0);
  });
});

describe("rollupFreshness", () => {
  it("returns the worst status present", () => {
    expect(rollupFreshness(["FRESH", "FRESH"])).toBe("FRESH");
    expect(rollupFreshness(["FRESH", "DELAYED"])).toBe("DELAYED");
    expect(rollupFreshness(["FRESH", "DELAYED", "STALE"])).toBe("STALE");
    expect(rollupFreshness(["DELAYED", "STALE"])).toBe("STALE");
  });

  it("is FRESH only when every timeframe is FRESH", () => {
    expect(rollupFreshness(["FRESH", "FRESH", "FRESH"])).toBe("FRESH");
  });
});
