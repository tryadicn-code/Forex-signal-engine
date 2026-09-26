import { describe, expect, it } from "vitest";
import { decide } from "@/core/execution";
import type { ExecutionInput } from "@/core/execution";
import type {
  BiasResultData,
  EngineResult,
  ExecutionResultData,
  RiskResultData,
  SetupResultData,
  TriggerResultData,
} from "@/types/engine";
import type { MarketSnapshot, OHLCV } from "@/types/market";

/** Fixed clock so freshness arithmetic is deterministic. */
const NOW = 1_700_000_000_000;

function candle(timestamp: number, close: number): OHLCV {
  return {
    timestamp,
    open: close - 0.0005,
    high: close + 0.001,
    low: close - 0.001,
    close,
    volume: 1000,
  };
}

/** Snapshot whose `asOf` is `ageMs` before the fixed clock. */
function snapshot(opts?: { ageMs?: number; spreadPips?: number }): MarketSnapshot {
  const asOf = NOW - (opts?.ageMs ?? 0);
  return {
    pair: "EURUSD",
    timeframe: "H1",
    candles: [candle(asOf - 3_600_000, 1.1), candle(asOf, 1.105)],
    asOf,
    spreadPips: opts?.spreadPips,
  };
}

const bias: BiasResultData = {
  label: "LONG",
  direction: "LONG",
  score: 55,
  components: { structure: 20, trend: 15, regime: 10, momentum: 10 },
  weights: { structure: 0.4, trend: 0.3, regime: 0.2, momentum: 0.1 },
};

const setup: SetupResultData = {
  state: "SETUP",
  zoneLow: 1.095,
  zoneHigh: 1.105,
  distanceToZone: 12,
  setupType: "demand-pullback",
  setupScore: 72,
  invalidationLevel: 1.09,
  zoneSource: "swing",
};

const trigger: TriggerResultData = {
  state: "CONFIRMED",
  triggerType: "BOS+IN_ZONE",
  triggerIndex: 40,
  triggerTimestamp: NOW - 3_600_000,
  ageInBars: 1,
  breakdown: {
    structural: { name: "BOS", fired: true, index: 40, timestamp: NOW - 3_600_000 },
    location: { name: "IN_ZONE", fired: true, index: 40, timestamp: NOW - 3_600_000 },
    candle: { name: null, fired: false, index: null, timestamp: null },
    momentum: { rsi: 58, macdHistogram: 0.0004, aligned: true },
    score: 81,
  },
};

const risk: RiskResultData = {
  riskCapital: 50,
  stopDistance: 0.005,
  stopDistancePips: 50,
  positionSize: 0.1,
  rr: 2.4,
  tp1: 1.112,
  tp2: 1.124,
  approved: true,
  rejectionReason: null,
};

/** A fully healthy input that clears every gate and vetoes. */
function greenInput(overrides: Partial<ExecutionInput> = {}): ExecutionInput {
  return {
    bias,
    setup,
    trigger,
    risk,
    context: { mode: "SIGNAL_ONLY", now: NOW },
    snapshot: snapshot({ spreadPips: 1.2 }),
    ...overrides,
  };
}

function conditionNamed(
  result: EngineResult<ExecutionResultData>,
  name: string
) {
  return result.data.conditions.find((check) => check.name === name);
}

describe("decide - market data fails closed", () => {
  it("executes when every gate passes on fresh data", () => {
    const result = decide(greenInput());
    expect(result.data.decision).toBe("EXECUTE");
    expect(result.data.triggeredVetoes).toEqual([]);
  });

  it("blocks when no market snapshot is supplied", () => {
    const result = decide(greenInput({ snapshot: undefined }));
    expect(result.data.decision).toBe("BLOCKED");
    const fresh = conditionNamed(result, "data_fresh");
    expect(fresh?.passed).toBe(false);
    expect(fresh?.detail).toContain("fails closed");
    // Absent data must be reported as not evaluated, never silently passed.
    expect(result.data.triggeredVetoes).not.toContain("STALE_DATA");
    const skipped = result.evidence.find(
      (item) => item.code === "VETO_STALE_DATA_SKIPPED"
    );
    expect(skipped).toBeDefined();
  });

  it("blocks when the snapshot is older than the max data age", () => {
    const result = decide(
      greenInput({ snapshot: snapshot({ ageMs: 120_000, spreadPips: 1.2 }) })
    );
    expect(result.data.decision).toBe("BLOCKED");
    expect(result.data.triggeredVetoes).toContain("STALE_DATA");
  });

  it("still executes with data exactly at the freshness boundary", () => {
    const result = decide(
      greenInput({ snapshot: snapshot({ ageMs: 60_000, spreadPips: 1.2 }) })
    );
    expect(result.data.decision).toBe("EXECUTE");
  });

  it("blocks in LIVE mode when the spread quote is missing", () => {
    const result = decide(
      greenInput({
        context: { mode: "LIVE", now: NOW },
        snapshot: snapshot({ spreadPips: undefined }),
      })
    );
    expect(result.data.decision).toBe("BLOCKED");
    const spread = conditionNamed(result, "spread_within_limit");
    expect(spread?.passed).toBe(false);
    expect(spread?.detail).toContain("LIVE");
  });

  it("blocks in LIVE mode when the spread exceeds the limit", () => {
    const result = decide(
      greenInput({
        context: { mode: "LIVE", now: NOW },
        snapshot: snapshot({ spreadPips: 9 }),
      })
    );
    expect(result.data.decision).toBe("BLOCKED");
    expect(result.data.triggeredVetoes).toContain("SPREAD_TOO_WIDE");
  });

  it("tolerates a missing spread outside LIVE mode", () => {
    const result = decide(greenInput({ snapshot: snapshot() }));
    expect(result.data.decision).toBe("EXECUTE");
  });
});

describe("decide - risk is not evaluated before trigger confirmation", () => {
  const waiting: TriggerResultData = {
    ...trigger,
    state: "WAITING",
    triggerType: null,
    ageInBars: null,
  };

  it("waits, rather than blocking, while the trigger is unconfirmed", () => {
    const result = decide(greenInput({ trigger: waiting, risk: null }));
    expect(result.data.decision).toBe("WAIT");
    const riskCondition = conditionNamed(result, "risk_approved");
    expect(riskCondition?.passed).toBe(false);
    expect(riskCondition?.detail).toContain("not evaluated");
  });

  it("never presents a provisional size as approved risk", () => {
    const result = decide(greenInput({ trigger: waiting, risk: null }));
    expect(result.data.decision).not.toBe("EXECUTE");
    expect(result.data.triggeredVetoes).toEqual([]);
  });
});
