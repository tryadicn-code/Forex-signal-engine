import { describe, it, expect } from "vitest";
import {
  isLegalTransition,
  transitionSignal,
  deriveSignalState,
  deriveStateReason,
  TTL_EXPIRED_REASON,
} from "@/scanner/signal-state-machine";
import type { PipelineResult } from "@/core/orchestrator";
import type { EngineResult } from "@/types/engine";
import type {
  BiasResultData,
  ExecutionResultData,
  RegimeResultData,
  RiskResultData,
  SetupResultData,
  StructureResultData,
  TriggerResultData,
} from "@/types/engine";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function engine<T>(data: T, score = 50): EngineResult<T> {
  return {
    status: "OK",
    score,
    evidence: [],
    conflicts: [],
    data,
    timestamp: new Date(T0).toISOString(),
  };
}

function pipeline(overrides: {
  setupState?: SetupResultData["state"];
  decision?: ExecutionResultData["decision"];
  triggerState?: TriggerResultData["state"];
  approved?: boolean;
  biasDirection?: BiasResultData["direction"];
  biasLabel?: BiasResultData["label"];
} = {}): PipelineResult {
  const setup: SetupResultData = {
    state: overrides.setupState ?? "NONE",
    zoneLow: 1.082,
    zoneHigh: 1.086,
    distanceToZone: 10,
    setupType: "supply",
    setupScore: 60,
    invalidationLevel: 1.07,
    zoneSource: "swing",
  };
  const trigger: EngineResult<TriggerResultData> | null =
    overrides.triggerState === undefined
      ? null
      : engine<TriggerResultData>({
          state: overrides.triggerState,
          triggerType: "BOS+IN_ZONE",
          triggerIndex: 100,
          triggerTimestamp: T0,
          ageInBars: 1,
          breakdown: {} as TriggerResultData["breakdown"],
        });
  const risk: EngineResult<RiskResultData> | null =
    overrides.approved === undefined
      ? null
      : engine<RiskResultData>({
          riskCapital: 50,
          stopDistance: 0.001,
          stopDistancePips: 10,
          positionSize: 0.5,
          rr: 2.5,
          tp1: 1.09,
          tp2: 1.1,
          approved: overrides.approved,
          rejectionReason: null,
        });
  const execution: EngineResult<ExecutionResultData> | null =
    overrides.decision === undefined
      ? null
      : engine<ExecutionResultData>({
          decision: overrides.decision,
          conditions: [],
          triggeredVetoes: [],
          reasons: [],
        });
  return {
    structure: engine<StructureResultData>({
      trend: "NEUTRAL",
      swingHighs: [],
      swingLows: [],
      lastSwingHigh: null,
      lastSwingLow: null,
      lastBOS: null,
      lastCHOCH: null,
      structurePoints: [],
      breakEvents: [],
      trendStrength: 0,
      equalHighs: [],
      equalLows: [],
    }),
    regime: engine<RegimeResultData>({
      regime: "RANGE",
      baseRegime: "RANGE",
      direction: "NEUTRAL",
      strength: 10,
      adx: 15,
      ema20: 1.08,
      ema50: 1.08,
      ema200: 1.08,
      atr: 0.001,
      bandWidthRatio: 1,
    }),
    bias: engine<BiasResultData>({
      label: overrides.biasLabel ?? "NEUTRAL",
      direction: overrides.biasDirection ?? "NEUTRAL",
      score: overrides.biasDirection === "LONG" ? 40 : -40,
      components: {} as BiasResultData["components"],
      weights: {} as BiasResultData["weights"],
    }),
    setup: engine<SetupResultData>(setup, 60),
    trigger,
    risk,
    execution,
  };
}

describe("legal transitions", () => {
  it("allows the core progression", () => {
    expect(isLegalTransition("DISCOVERED", "WATCH")).toBe(true);
    expect(isLegalTransition("WATCH", "SETUP")).toBe(true);
    expect(isLegalTransition("SETUP", "ARMED")).toBe(true);
    expect(isLegalTransition("ARMED", "TRIGGERED")).toBe(true);
    expect(isLegalTransition("TRIGGERED", "RISK_APPROVED")).toBe(true);
    expect(isLegalTransition("RISK_APPROVED", "EXECUTE")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(isLegalTransition("WATCH", "EXECUTE")).toBe(false);
    expect(isLegalTransition("DISCOVERED", "EXECUTE")).toBe(false);
    expect(isLegalTransition("CLOSED", "EXECUTE")).toBe(false);
  });

  it("treats staying in the same state as a no-op transition", () => {
    expect(isLegalTransition("WATCH", "WATCH")).toBe(true);
  });

  it("never leaves the terminal CLOSED state", () => {
    expect(isLegalTransition("CLOSED", "WATCH")).toBe(false);
    expect(isLegalTransition("CLOSED", "EXECUTE")).toBe(false);
    expect(isLegalTransition("CLOSED", "MANAGE")).toBe(false);
  });
});

describe("transitionSignal", () => {
  it("applies a legal transition and records the reason", () => {
    const result = transitionSignal("WATCH", "SETUP", "Setup Engine located a valid zone.", T0);
    expect(result.legal).toBe(true);
    expect(result.state).toBe("SETUP");
    expect(result.transition?.previousState).toBe("WATCH");
    expect(result.transition?.newState).toBe("SETUP");
    expect(result.transition?.reason).toBe("Setup Engine located a valid zone.");
    expect(result.transition?.timestamp).toBe(T0);
  });

  it("refuses an illegal transition and keeps the current state", () => {
    const result = transitionSignal("WATCH", "EXECUTE", "caller asked", T0);
    expect(result.legal).toBe(false);
    expect(result.state).toBe("WATCH");
    expect(result.transition).toBeNull();
    expect(result.refusalReason).toContain("Illegal transition");
  });

  it("is a no-op when target equals current", () => {
    const result = transitionSignal("SETUP", "SETUP", "unchanged", T0);
    expect(result.legal).toBe(true);
    expect(result.transition).toBeNull();
  });
});

describe("deriveSignalState", () => {
  it("returns DISCOVERED when bias is neutral and no setup exists", () => {
    expect(deriveSignalState({ pipeline: pipeline() })).toBe("DISCOVERED");
  });

  it("returns WATCH when bias has a direction but no setup", () => {
    expect(
      deriveSignalState({ pipeline: pipeline({ biasDirection: "LONG", biasLabel: "LONG" }) })
    ).toBe("WATCH");
  });

  it("maps a confirmed trigger with approved risk toward EXECUTE", () => {
    const p = pipeline({
      setupState: "SETUP",
      triggerState: "CONFIRMED",
      approved: true,
      decision: "EXECUTE",
      biasDirection: "LONG",
      biasLabel: "LONG",
    });
    expect(deriveSignalState({ pipeline: p })).toBe("EXECUTE");
  });

  it("BLOCKS when the Execution Engine is BLOCKED", () => {
    const p = pipeline({
      setupState: "SETUP",
      triggerState: "CONFIRMED",
      approved: true,
      decision: "BLOCKED",
      biasDirection: "LONG",
      biasLabel: "LONG",
    });
    expect(deriveSignalState({ pipeline: p })).toBe("BLOCKED");
  });

  it("BLOCKS when required data is stale, even with a good setup", () => {
    const p = pipeline({
      setupState: "SETUP",
      triggerState: "CONFIRMED",
      approved: true,
      decision: "EXECUTE",
      biasDirection: "LONG",
      biasLabel: "LONG",
    });
    expect(deriveSignalState({ pipeline: p, stale: true })).toBe("BLOCKED");
  });

  it("BLOCKS when the quote->account conversion is unresolved", () => {
    const p = pipeline({
      setupState: "SETUP",
      decision: "EXECUTE",
      biasDirection: "LONG",
      biasLabel: "LONG",
    });
    expect(deriveSignalState({ pipeline: p, conversionUnresolved: true })).toBe("BLOCKED");
  });

  it("INVALIDATED outranks progress states", () => {
    const p = pipeline({
      setupState: "INVALIDATED",
      decision: "EXECUTE",
      biasDirection: "LONG",
      biasLabel: "LONG",
    });
    expect(deriveSignalState({ pipeline: p })).toBe("INVALIDATED");
  });

  it("expiry is terminal: CLOSED outranks every progress state", () => {
    const p = pipeline({
      setupState: "SETUP",
      triggerState: "CONFIRMED",
      approved: true,
      decision: "EXECUTE",
      biasDirection: "LONG",
      biasLabel: "LONG",
    });
    // Even a fully approved EXECUTE candidate is closed once its TTL lapses.
    expect(deriveSignalState({ pipeline: p, expired: true })).toBe("CLOSED");
  });

  it("does not let expiry revive an INVALIDATED setup", () => {
    const p = pipeline({ setupState: "INVALIDATED" });
    expect(deriveSignalState({ pipeline: p, expired: true })).toBe("INVALIDATED");
  });
});

describe("deriveStateReason", () => {
  it("explains a stale-data block", () => {
    const p = pipeline({ setupState: "SETUP" });
    expect(deriveStateReason({ pipeline: p, stale: true })).toContain("stale");
  });

  it("explains an expiry closure", () => {
    const p = pipeline({ setupState: "SETUP" });
    const reason = deriveStateReason({ pipeline: p, expired: true });
    expect(reason.toLowerCase()).toContain("ttl");
  });

  it("explains an approved execution", () => {
    const p = pipeline({
      setupState: "SETUP",
      triggerState: "CONFIRMED",
      approved: true,
      decision: "EXECUTE",
      biasDirection: "LONG",
      biasLabel: "LONG",
    });
    expect(deriveStateReason({ pipeline: p })).toContain("All Phase 1 gates passed");
  });

  it("explains neutral discovery", () => {
    expect(deriveStateReason({ pipeline: pipeline() })).toContain("neutral");
  });
});

describe("TTL reason constant", () => {
  it("is a stable machine-readable code", () => {
    expect(TTL_EXPIRED_REASON).toBe("TTL_EXPIRED");
  });
});
