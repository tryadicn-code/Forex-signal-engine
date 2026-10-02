import { describe, expect, it } from "vitest";
import {
  buildSignalFunnelDashboard,
  buildSignalFunnelObservation,
  type SignalFunnelObservation,
} from "@/analytics/signal-funnel";
import type { PipelineResult } from "@/core/orchestrator";
import { failureResult, type SymbolScanResult } from "@/scanner/scanner-result";

const T0 = Date.UTC(2026, 9, 2, 6, 0, 0);

function analysedResult(overrides: Partial<SymbolScanResult> = {}): SymbolScanResult {
  return {
    ...failureResult("EURUSD", "PROVIDER_FAILURE", "seed", T0),
    status: "ANALYSED",
    reason: "Analysed successfully.",
    regime: "TREND_UP",
    bias: "LONG",
    biasScore: 50,
    biasDirection: "LONG",
    setupState: "SETUP",
    setupScore: 70,
    triggerState: "WAITING",
    triggerScore: 50,
    executionDecision: "WAIT",
    ...overrides,
  };
}

function pipeline(input: {
  biasDirection?: "LONG" | "SHORT" | "NEUTRAL";
  setupState?: "NONE" | "WATCH" | "SETUP" | "ARMED" | "INVALIDATED";
  setupEvidenceCode?: string;
  triggerState?: "WAITING" | "CONFIRMED" | "INVALIDATED";
  structural?: boolean;
  location?: boolean;
  candle?: boolean;
  momentum?: boolean;
  triggerScore?: number;
  riskApproved?: boolean | null;
  riskReason?: string | null;
  decision?: "WAIT" | "EXECUTE" | "BLOCKED" | "INVALIDATED";
  vetoes?: string[];
} = {}): PipelineResult {
  const biasDirection = input.biasDirection ?? "LONG";
  const setupState = input.setupState ?? "SETUP";
  const triggerState = input.triggerState ?? "WAITING";
  const structural = input.structural ?? true;
  const location = input.location ?? true;
  const candle = input.candle ?? false;
  const momentum = input.momentum ?? false;
  const triggerScore = input.triggerScore ?? 80;
  const riskApproved = input.riskApproved ?? null;
  const decision = input.decision ?? "WAIT";
  const vetoes = input.vetoes ?? [];

  const setupEvidenceCode =
    input.setupEvidenceCode ??
    (setupState === "WATCH"
      ? "SCORE_TOO_LOW"
      : setupState === "NONE"
        ? "ZONE_TOO_FAR"
        : null);

  return {
    structure: {},
    regime: { data: { regime: "TREND_UP" } },
    bias: {
      data: { direction: biasDirection, score: biasDirection === "NEUTRAL" ? 0 : 50 },
      evidence: [],
      conflicts:
        biasDirection === "NEUTRAL"
          ? [{
              code: "NEUTRAL_BIAS",
              description: "Bias score does not clear the directional threshold.",
            }]
          : [],
    },
    setup: {
      data: { state: setupState },
      evidence:
        setupEvidenceCode && setupState !== "INVALIDATED"
          ? [{
              code: setupEvidenceCode,
              description: `Setup diagnostic: ${setupEvidenceCode}.`,
            }]
          : [],
      conflicts:
        setupState === "INVALIDATED"
          ? [{
              code: "ZONE_INVALIDATED",
              description: "Setup zone invalidated.",
            }]
          : [],
    },
    setupStructure: {},
    trigger:
      setupState === "NONE" || setupState === "INVALIDATED" || biasDirection === "NEUTRAL"
        ? null
        : {
            data: {
              state: triggerState,
              breakdown: {
                structural: { fired: structural },
                location: { fired: location },
                candle: { fired: candle },
                momentum: { aligned: momentum },
                score: triggerScore,
              },
            },
          },
    risk:
      riskApproved === null
        ? null
        : {
            data: {
              approved: riskApproved,
              rejectionReason: input.riskReason ?? null,
            },
          },
    execution:
      setupState === "NONE" || setupState === "INVALIDATED" || biasDirection === "NEUTRAL"
        ? null
        : {
            data: {
              decision,
              triggeredVetoes: vetoes,
              reasons: vetoes.length ? [`Blocked by ${vetoes[0]}.`] : [],
            },
          },
  } as unknown as PipelineResult;
}

describe("Signal Funnel observation classification", () => {
  it("records provider failures at the data-valid gate", () => {
    const result = failureResult("EURUSD", "PROVIDER_FAILURE", "feed down", T0);
    const observation = buildSignalFunnelObservation(result, null, T0);

    expect(observation.passedStages).toEqual(["SCANNED"]);
    expect(observation.rejectionStage).toBe("DATA_VALID");
    expect(observation.rejectionCode).toBe("PROVIDER_FAILURE");
  });

  it("separates neutral bias from setup rejection", () => {
    const result = analysedResult({ biasDirection: "NEUTRAL", bias: "NEUTRAL" });
    const observation = buildSignalFunnelObservation(
      result,
      pipeline({ biasDirection: "NEUTRAL" }),
      T0
    );

    expect(observation.passedStages).toEqual(["SCANNED", "DATA_VALID"]);
    expect(observation.rejectionCode).toBe("BIAS_THRESHOLD_NOT_MET");
  });

  it("separates setup score and location failures into stable reason codes", () => {
    const lowScore = buildSignalFunnelObservation(
      analysedResult({ setupState: "WATCH" }),
      pipeline({ setupState: "WATCH", setupEvidenceCode: "SCORE_TOO_LOW" }),
      T0
    );
    const tooFar = buildSignalFunnelObservation(
      analysedResult({ setupState: "NONE" }),
      pipeline({ setupState: "NONE", setupEvidenceCode: "ZONE_TOO_FAR" }),
      T0
    );

    expect(lowScore.rejectionStage).toBe("SETUP_ACTIONABLE");
    expect(lowScore.rejectionCode).toBe("SETUP_SCORE_TOO_LOW");
    expect(tooFar.rejectionCode).toBe("SETUP_ZONE_TOO_FAR");
  });

  it("identifies structure+location with no optional confirmation", () => {
    const result = analysedResult();
    const observation = buildSignalFunnelObservation(
      result,
      pipeline({
        triggerState: "WAITING",
        structural: true,
        location: true,
        candle: false,
        momentum: false,
        triggerScore: 80,
      }),
      T0
    );

    expect(observation.rejectionStage).toBe("TRIGGER_CONFIRMED");
    expect(observation.rejectionCode).toBe("TRIGGER_NO_OPTIONAL_CONFIRMATION");
  });

  it("surfaces the Risk Engine rejection reason as a stable code", () => {
    const result = analysedResult({
      triggerState: "CONFIRMED",
      triggerScore: 100,
    });
    const observation = buildSignalFunnelObservation(
      result,
      pipeline({
        triggerState: "CONFIRMED",
        triggerScore: 100,
        riskApproved: false,
        riskReason: "RR_TOO_LOW",
      }),
      T0
    );

    expect(observation.rejectionStage).toBe("RISK_APPROVED");
    expect(observation.rejectionCode).toBe("RISK_RR_TOO_LOW");
  });

  it("distinguishes hard vetoes from ordinary execution WAIT", () => {
    const result = analysedResult({
      triggerState: "CONFIRMED",
      triggerScore: 100,
      riskReward: 2,
      executionDecision: "BLOCKED",
    });
    const observation = buildSignalFunnelObservation(
      result,
      pipeline({
        triggerState: "CONFIRMED",
        triggerScore: 100,
        riskApproved: true,
        decision: "BLOCKED",
        vetoes: ["SPREAD_TOO_HIGH"],
      }),
      T0
    );

    expect(observation.passedStages).toContain("RISK_APPROVED");
    expect(observation.passedStages).not.toContain("NO_HARD_VETO");
    expect(observation.rejectionCode).toBe("VETO_SPREAD_TOO_HIGH");
  });

  it("marks an execution candidate as surviving every gate", () => {
    const result = analysedResult({
      triggerState: "CONFIRMED",
      triggerScore: 100,
      riskReward: 2.2,
      executionDecision: "EXECUTE",
    });
    const observation = buildSignalFunnelObservation(
      result,
      pipeline({
        triggerState: "CONFIRMED",
        triggerScore: 100,
        riskApproved: true,
        decision: "EXECUTE",
      }),
      T0
    );

    expect(observation.deepestStage).toBe("EXECUTE");
    expect(observation.rejectionCode).toBeNull();
    expect(observation.passedStages.at(-1)).toBe("EXECUTE");
  });
});

describe("Signal Funnel rolling summaries", () => {
  it("calculates drop-off, rejection frequency, and excludes observations outside the window", () => {
    const recent: SignalFunnelObservation[] = [
      buildSignalFunnelObservation(
        analysedResult({ triggerState: "CONFIRMED", executionDecision: "EXECUTE" }),
        pipeline({ triggerState: "CONFIRMED", riskApproved: true, decision: "EXECUTE" }),
        T0
      ),
      buildSignalFunnelObservation(
        analysedResult(),
        pipeline({
          triggerState: "WAITING",
          structural: true,
          location: true,
          candle: false,
          momentum: false,
        }),
        T0 - 60_000
      ),
    ];
    const old = buildSignalFunnelObservation(
      failureResult("GBPUSD", "PROVIDER_FAILURE", "old", T0 - 40 * 24 * 60 * 60 * 1000),
      null,
      T0 - 40 * 24 * 60 * 60 * 1000
    );

    const dashboard = buildSignalFunnelDashboard([...recent, old], T0);
    const summary = dashboard.windows["24H"];

    expect(summary.observations).toBe(2);
    expect(summary.executions).toBe(1);
    expect(
      summary.rejectionReasons.find(
        (item) => item.code === "TRIGGER_NO_OPTIONAL_CONFIRMATION"
      )?.count
    ).toBe(1);
    expect(
      summary.stageStats.find((item) => item.stage === "TRIGGER_CONFIRMED")?.dropOff
    ).toBe(1);
  });
});
