import { describe, it, expect } from "vitest";
import {
  createLifecycle,
  isSetupExpired,
  isTriggerExpired,
  recordTransition,
  computeSignalIdentity,
  freshTriggerOccurrenceIdentity,
  resolveLifecycleIdentity,
  shouldCloseSupersededLifecycle,
} from "@/scanner/signal-lifecycle";
import { intervalMs } from "@/market-data/timeframe";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);
const M15 = intervalMs("M15");
const H1 = intervalMs("H1");

describe("multi-strategy lifecycle identity", () => {
  it("separates otherwise-identical setups owned by different strategies", () => {
    const base = {
      symbol: "EURUSD",
      direction: "LONG" as const,
      originTimeframe: "H1" as const,
      originTimestamp: T0,
      zoneLow: 1.1,
      zoneHigh: 1.101,
      pipSize: 0.0001,
    };

    const trend = computeSignalIdentity({
      ...base,
      strategyId: "TREND_PULLBACK",
    });
    const breakout = computeSignalIdentity({
      ...base,
      strategyId: "BREAKOUT_RETEST",
    });

    expect(trend.signalId).not.toBe(breakout.signalId);
    expect(trend.strategyId).toBe("TREND_PULLBACK");
    expect(breakout.strategyId).toBe("BREAKOUT_RETEST");
  });

  it("preserves legacy deterministic ids when strategy id is absent", () => {
    const identity = computeSignalIdentity({
      symbol: "EURUSD",
      direction: "LONG",
      originTimeframe: "H1",
      originTimestamp: T0,
      zoneLow: 1.1,
      zoneHigh: 1.101,
      pipSize: 0.0001,
    });

    expect(identity.signalId).not.toContain("|strategy:");
    expect(identity.strategyId).toBeNull();
  });
});

describe("multi-strategy lifecycle supersession", () => {
  const trendIdentity = computeSignalIdentity({
    symbol: "EURUSD",
    strategyId: "TREND_PULLBACK",
    direction: "LONG",
    originTimeframe: "H1",
    originTimestamp: T0,
    zoneLow: 1.1,
    zoneHigh: 1.101,
    pipSize: 0.0001,
  });
  const activeTrend = {
    ...createLifecycle(trendIdentity, T0),
    state: "ARMED" as const,
  };

  it("closes an active signal when the router changes strategy", () => {
    expect(
      shouldCloseSupersededLifecycle({
        lifecycle: activeTrend,
        keepSignalId: null,
        activeStrategyId: "RANGE_MEAN_REVERSION",
        closeSameStrategy: false,
      })
    ).toBe(true);
  });

  it("closes an active signal when the router deliberately selects WAIT", () => {
    expect(
      shouldCloseSupersededLifecycle({
        lifecycle: activeTrend,
        keepSignalId: null,
        activeStrategyId: null,
        closeSameStrategy: false,
      })
    ).toBe(true);
  });

  it("preserves a same-strategy lifecycle when no replacement setup exists", () => {
    expect(
      shouldCloseSupersededLifecycle({
        lifecycle: activeTrend,
        keepSignalId: null,
        activeStrategyId: "TREND_PULLBACK",
        closeSameStrategy: false,
      })
    ).toBe(false);
  });

  it("closes an old same-strategy setup when a newer setup identity replaces it", () => {
    expect(
      shouldCloseSupersededLifecycle({
        lifecycle: activeTrend,
        keepSignalId: "different-new-signal",
        activeStrategyId: "TREND_PULLBACK",
        closeSameStrategy: true,
      })
    ).toBe(true);
  });

  it("never closes the lifecycle that owns the current signal id", () => {
    expect(
      shouldCloseSupersededLifecycle({
        lifecycle: activeTrend,
        keepSignalId: trendIdentity.signalId,
        activeStrategyId: "TREND_PULLBACK",
        closeSameStrategy: true,
      })
    ).toBe(false);
  });
});

describe("bar-aware TTL", () => {
  it("is not expired while within the allowed number of bars", () => {
    const origin = T0 - M15;
    // Trigger fired 1 bar ago with ttlBars = 3 -> still valid.
    expect(isTriggerExpired(origin, "M15", T0, 3)).toBe(false);
  });

  it("stays valid up to exactly ttlBars elapsed bars", () => {
    const origin = T0 - 3 * M15;
    expect(isTriggerExpired(origin, "M15", T0, 3)).toBe(false);
  });

  it("expires once more than ttlBars bars have closed", () => {
    const origin = T0 - 4 * M15;
    expect(isTriggerExpired(origin, "M15", T0, 3)).toBe(true);
  });

  it("never expires when there is no origin", () => {
    expect(isTriggerExpired(null, "M15", T0, 3)).toBe(false);
    expect(isSetupExpired(null, "H1", T0, 6)).toBe(false);
  });

  it("counts bars on the timeframe being measured, not wall-clock seconds", () => {
    // 4 H1 bars is 4 hours; the setup TTL of 6 H1 bars has not lapsed.
    const origin = T0 - 4 * H1;
    expect(isSetupExpired(origin, "H1", T0, 6)).toBe(false);
    // 8 H1 bars exceeds the setup TTL.
    expect(isSetupExpired(T0 - 8 * H1, "H1", T0, 6)).toBe(true);
  });

  it("is deterministic: the same inputs always give the same answer", () => {
    const origin = T0 - 5 * M15;
    expect(isTriggerExpired(origin, "M15", T0, 3)).toBe(true);
    expect(isTriggerExpired(origin, "M15", T0, 3)).toBe(true);
  });
});

describe("lifecycle records", () => {
  const identity = computeSignalIdentity({
    symbol: "EURUSD",
    direction: "LONG",
    originTimeframe: "H1",
    originTimestamp: T0,
    zoneLow: 1.082,
    zoneHigh: 1.086,
    pipSize: 0.0001,
  });

  it("starts in DISCOVERED with no origins", () => {
    const lifecycle = createLifecycle(identity, T0);
    expect(lifecycle.state).toBe("DISCOVERED");
    expect(lifecycle.setupOriginTimestamp).toBeNull();
    expect(lifecycle.triggerOriginTimestamp).toBeNull();
    expect(lifecycle.transitions).toEqual([]);
  });

  it("recordTransition returns an updated copy without mutating the input", () => {
    const lifecycle = createLifecycle(identity, T0);
    const updated = recordTransition(
      lifecycle,
      {
        signalId: identity.signalId,
        symbol: "EURUSD",
        previousState: "DISCOVERED",
        newState: "WATCH",
        timestamp: T0,
        reason: "Bias is LONG but no setup yet.",
      },
      T0
    );
    expect(lifecycle.transitions.length).toBe(0);
    expect(updated.state).toBe("WATCH");
    expect(updated.transitions.length).toBe(1);
    expect(updated.updatedAt).toBe(T0);
  });
});


describe("fresh trigger occurrences after terminal lifecycle", () => {
  const baseIdentity = computeSignalIdentity({
    symbol: "EURUSD",
    direction: "LONG",
    originTimeframe: "H1",
    originTimestamp: T0,
    zoneLow: 1.082,
    zoneHigh: 1.086,
    pipSize: 0.0001,
  });

  it("keeps CLOSED terminal and gives a newer trigger a new deterministic identity", () => {
    const closed = {
      ...createLifecycle(baseIdentity, T0),
      state: "CLOSED" as const,
      triggerOriginTimestamp: T0,
    };

    const nextTrigger = T0 + M15;
    const resolved = resolveLifecycleIdentity(
      baseIdentity,
      closed,
      nextTrigger
    );

    expect(resolved.signalId).not.toBe(baseIdentity.signalId);
    expect(resolved.signalId).toBe(
      freshTriggerOccurrenceIdentity(baseIdentity, nextTrigger).signalId
    );
    expect(closed.state).toBe("CLOSED");
  });

  it("does not fork a new id for the same or older trigger", () => {
    const closed = {
      ...createLifecycle(baseIdentity, T0),
      state: "CLOSED" as const,
      triggerOriginTimestamp: T0,
    };

    expect(
      resolveLifecycleIdentity(baseIdentity, closed, T0).signalId
    ).toBe(baseIdentity.signalId);
    expect(
      resolveLifecycleIdentity(baseIdentity, closed, T0 - M15).signalId
    ).toBe(baseIdentity.signalId);
  });

  it("does not change identity while lifecycle is still active", () => {
    const active = {
      ...createLifecycle(baseIdentity, T0),
      state: "EXECUTE" as const,
      triggerOriginTimestamp: T0,
    };

    expect(
      resolveLifecycleIdentity(baseIdentity, active, T0 + M15).signalId
    ).toBe(baseIdentity.signalId);
  });
});
