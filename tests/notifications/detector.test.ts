import { describe, expect, it } from "vitest";
import { resolveNotificationConfig } from "@/config/notifications";
import {
  classifyAlertState,
  detectAlertCandidate,
} from "@/notifications/detector";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { SymbolScanResult } from "@/scanner/scanner-result";

const config = resolveNotificationConfig({
  FSE_ALERTS_ENABLED: "true",
  FSE_ALERT_WATCH: "true",
  FSE_ALERT_BLOCKED: "true",
});

function release(): ReleaseRuntimeState {
  return {
    status: "ACTIVE",
    reason: "ACTIVE_RELEASE",
    canScan: true,
    version: "1.2.3",
    title: "test",
    manifestFingerprint: "fp",
    sourceReportId: "backtest-test",
    activationAt: 1000,
    registryUpdatedAt: 1000,
    resolvedAt: 2000,
    pinned: true,
    defaultDrift: false,
    driftAreas: [],
    message: "active",
  };
}

function result(
  overrides: Partial<SymbolScanResult> = {}
): SymbolScanResult {
  return {
    symbol: "EURUSD",
    status: "ANALYSED",
    reason: "ok",
    latestPrice: 1.1,
    spreadPips: 1,
    regime: "TREND_UP",
    bias: "LONG",
    biasScore: 82,
    biasDirection: "LONG",
    setupState: "ARMED",
    setupScore: 88,
    triggerState: "WAITING",
    triggerScore: 78,
    triggerAgeInBars: 0,
    riskReward: 2.1,
    positionSize: 0.05,
    executionDecision: "WAIT",
    signalState: "ARMED",
    signalId: "sig-1",
    freshness: "FRESH",
    updatedAt: 2000,
    timeframes: [],
    executionDetail: {
      decision: "WAIT",
      conditions: [
        {
          name: "TRIGGER_CONFIRMATION",
          passed: false,
          detail: "Waiting for trigger.",
        },
      ],
      triggeredVetoes: [],
      reasons: ["Waiting for trigger."],
    },
    riskDetail: {
      approved: true,
      rejectionReason: null,
      entryPrice: 1.1,
      stopLoss: 1.095,
      stopDistancePips: 50,
      takeProfit1: 1.11,
      takeProfit2: 1.115,
      riskCapital: 20,
      riskPercent: 0.2,
      positionSize: 0.05,
      plannedRR: 2.1,
      pipSize: 0.0001,
      accountCurrency: "USD",
    },
    evidence: [],
    conflicts: [],
    issues: [],
    errors: [],
    ...overrides,
  };
}

describe("Phase 11 alert detector", () => {
  it("classifies a fresh armed setup one trigger away as NEAR_EXECUTE", () => {
    expect(classifyAlertState(result(), config)).toBe("NEAR_EXECUTE");
    const alert = detectAlertCandidate(result(), release(), config, 3000);
    expect(alert?.state).toBe("NEAR_EXECUTE");
    expect(alert?.waitingFor).toContain("TRIGGER_CONFIRMATION");
    expect(alert?.key).toContain("1.2.3");
    expect(alert?.key).toContain("sig-1");
  });

  it("does not classify stale or vetoed setup as NEAR_EXECUTE", () => {
    expect(
      classifyAlertState(result({ freshness: "STALE" }), config)
    ).toBe("WATCH");

    expect(
      classifyAlertState(
        result({
          executionDetail: {
            decision: "WAIT",
            conditions: [],
            triggeredVetoes: ["SPREAD_TOO_WIDE"],
            reasons: [],
          },
        }),
        config
      )
    ).toBe("WATCH");
  });

  it("prioritizes EXECUTE, BLOCKED and INVALIDATED lifecycle states", () => {
    expect(
      classifyAlertState(
        result({
          executionDecision: "EXECUTE",
          signalState: "EXECUTE",
          triggerState: "CONFIRMED",
        }),
        config
      )
    ).toBe("EXECUTE_READY");

    expect(
      classifyAlertState(
        result({
          executionDecision: "BLOCKED",
          signalState: "BLOCKED",
        }),
        config
      )
    ).toBe("BLOCKED");

    expect(
      classifyAlertState(
        result({
          executionDecision: "INVALIDATED",
          signalState: "INVALIDATED",
        }),
        config
      )
    ).toBe("INVALIDATED");
  });
});
