import type { PipelineResult } from "@/core/orchestrator";
import type { SymbolScanResult } from "@/scanner/scanner-result";

export const SIGNAL_FUNNEL_STAGES = [
  "SCANNED",
  "DATA_VALID",
  "BIAS_DIRECTIONAL",
  "SETUP_ACTIONABLE",
  "TRIGGER_CONFIRMED",
  "RISK_APPROVED",
  "NO_HARD_VETO",
  "EXECUTE",
] as const;

export type SignalFunnelStage = (typeof SIGNAL_FUNNEL_STAGES)[number];
export type SignalFunnelWindow = "24H" | "7D" | "30D";

export const SIGNAL_FUNNEL_WINDOW_MS: Record<SignalFunnelWindow, number> = {
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
  "30D": 30 * 24 * 60 * 60 * 1000,
};

export const SIGNAL_FUNNEL_MAX_RETENTION_MS = SIGNAL_FUNNEL_WINDOW_MS["30D"];

export interface SignalFunnelObservation {
  symbol: string;
  observedAt: number;
  /** Actual audited strategy used for this observation. */
  strategyId: string | null;
  /** Strategy preferred by regime routing, even when not implemented yet. */
  preferredStrategyId?: string | null;
  /** Whether the selected strategy was a direct regime match or compatibility fallback. */
  routingMode?: string | null;
  regime: SymbolScanResult["regime"];
  biasDirection: SymbolScanResult["biasDirection"];
  setupState: SymbolScanResult["setupState"];
  triggerState: SymbolScanResult["triggerState"];
  executionDecision: SymbolScanResult["executionDecision"];
  passedStages: SignalFunnelStage[];
  deepestStage: SignalFunnelStage;
  rejectionStage: SignalFunnelStage | null;
  rejectionCode: string | null;
  rejectionDetail: string | null;
}

export interface SignalFunnelStageStat {
  stage: SignalFunnelStage;
  count: number;
  /** Percentage of the previous stage that survived into this stage. */
  conversionRate: number | null;
  /** Absolute observations lost between the previous stage and this stage. */
  dropOff: number;
}

export interface RejectionReasonStat {
  code: string;
  stage: SignalFunnelStage;
  count: number;
  percentage: number;
}

export interface RegimeFunnelStat {
  regime: string;
  observations: number;
  executions: number;
  executionRate: number;
}

export interface SignalFunnelSummary {
  window: SignalFunnelWindow;
  from: number;
  to: number;
  observations: number;
  executions: number;
  stageStats: SignalFunnelStageStat[];
  rejectionReasons: RejectionReasonStat[];
  regimeStats: RegimeFunnelStat[];
}

export interface SignalFunnelDashboard {
  asOf: number;
  windows: Record<SignalFunnelWindow, SignalFunnelSummary>;
}

export function buildSignalFunnelObservation(
  result: SymbolScanResult,
  pipeline: PipelineResult | null,
  observedAt: number
): SignalFunnelObservation {
  const passedStages: SignalFunnelStage[] = ["SCANNED"];

  const base = {
    symbol: result.symbol,
    observedAt,
    strategyId: result.strategyId,
    preferredStrategyId: result.strategyRouting?.preferredStrategyId ?? null,
    routingMode: result.strategyRouting?.mode ?? null,
    regime: result.regime,
    biasDirection: result.biasDirection,
    setupState: result.setupState,
    triggerState: result.triggerState,
    executionDecision: result.executionDecision,
  };

  const reject = (
    stage: SignalFunnelStage,
    code: string,
    detail: string
  ): SignalFunnelObservation => ({
    ...base,
    passedStages,
    deepestStage: passedStages[passedStages.length - 1],
    rejectionStage: stage,
    rejectionCode: code,
    rejectionDetail: detail,
  });

  if (result.status !== "ANALYSED") {
    return reject("DATA_VALID", result.status, result.reason);
  }

  passedStages.push("DATA_VALID");

  if (pipeline === null) {
    return reject(
      "BIAS_DIRECTIONAL",
      "PIPELINE_NOT_AVAILABLE",
      "The symbol was marked analysed but no pipeline result was available."
    );
  }

  if (pipeline.bias.data.direction === "NEUTRAL") {
    const neutralEvidence = findEvidence(
      pipeline.bias.conflicts,
      "NEUTRAL_BIAS"
    );
    return reject(
      "BIAS_DIRECTIONAL",
      "BIAS_THRESHOLD_NOT_MET",
      neutralEvidence?.description ??
        `Bias score ${pipeline.bias.data.score} resolved to NEUTRAL.`
    );
  }

  passedStages.push("BIAS_DIRECTIONAL");

  const setupState = pipeline.setup.data.state;
  if (setupState !== "SETUP" && setupState !== "ARMED") {
    const setupReason = resolveSetupRejection(pipeline);
    return reject(
      "SETUP_ACTIONABLE",
      setupReason.code,
      setupReason.detail
    );
  }

  passedStages.push("SETUP_ACTIONABLE");

  const trigger = pipeline.trigger?.data ?? null;
  if (trigger === null) {
    return reject(
      "TRIGGER_CONFIRMED",
      "TRIGGER_NOT_EVALUATED",
      "Trigger Engine was not evaluated for the current setup."
    );
  }

  if (trigger.state !== "CONFIRMED") {
    if (trigger.state === "INVALIDATED") {
      return reject(
        "TRIGGER_CONFIRMED",
        "TRIGGER_INVALIDATED",
        "Price moved beyond the setup invalidation level."
      );
    }

    if (!trigger.breakdown.structural.fired) {
      return reject(
        "TRIGGER_CONFIRMED",
        "TRIGGER_NO_STRUCTURE",
        "No fresh BOS, CHOCH, or reclaim confirmed in the trade direction."
      );
    }

    if (!trigger.breakdown.location.fired) {
      return reject(
        "TRIGGER_CONFIRMED",
        "TRIGGER_OUTSIDE_ZONE",
        "Price is not inside or validly retesting the setup zone."
      );
    }

    if (
      !trigger.breakdown.candle.fired &&
      !trigger.breakdown.momentum.aligned
    ) {
      return reject(
        "TRIGGER_CONFIRMED",
        "TRIGGER_NO_OPTIONAL_CONFIRMATION",
        `Structure and location passed, but candle and momentum confirmation are absent (score ${trigger.breakdown.score}).`
      );
    }

    return reject(
      "TRIGGER_CONFIRMED",
      "TRIGGER_SCORE_BELOW_MIN",
      `Composite trigger remains unconfirmed at score ${trigger.breakdown.score}.`
    );
  }

  passedStages.push("TRIGGER_CONFIRMED");

  const risk = pipeline.risk?.data ?? null;
  if (risk === null) {
    return reject(
      "RISK_APPROVED",
      "RISK_NOT_EVALUATED",
      "Trigger confirmed but the Risk Engine returned no evaluation."
    );
  }

  if (!risk.approved) {
    const reason = normalizeCode(risk.rejectionReason ?? "REJECTED");
    return reject(
      "RISK_APPROVED",
      `RISK_${reason}`,
      risk.rejectionReason ?? "Risk Engine rejected the candidate."
    );
  }

  passedStages.push("RISK_APPROVED");

  const execution = pipeline.execution?.data ?? null;
  if (execution === null) {
    return reject(
      "NO_HARD_VETO",
      "EXECUTION_NOT_EVALUATED",
      "Risk passed but the Execution Engine returned no evaluation."
    );
  }

  if (execution.triggeredVetoes.length > 0) {
    const veto = execution.triggeredVetoes[0];
    return reject(
      "NO_HARD_VETO",
      `VETO_${normalizeCode(veto)}`,
      execution.reasons.join(" ") || `Hard veto fired: ${veto}.`
    );
  }

  passedStages.push("NO_HARD_VETO");

  if (execution.decision !== "EXECUTE") {
    const failedCondition = execution.conditions.find(
      (condition) =>
        !condition.passed &&
        ![
          "bias_valid",
          "setup_valid",
          "trigger_confirmed",
          "risk_approved",
          "no_hard_veto",
        ].includes(condition.name)
    );
    return reject(
      "EXECUTE",
      failedCondition
        ? `EXECUTION_${normalizeCode(failedCondition.name)}_FAILED`
        : `EXECUTION_${execution.decision}`,
      failedCondition?.detail ||
        execution.reasons.join(" ") ||
        `Execution decision was ${execution.decision}.`
    );
  }

  passedStages.push("EXECUTE");

  return {
    ...base,
    passedStages,
    deepestStage: "EXECUTE",
    rejectionStage: null,
    rejectionCode: null,
    rejectionDetail: null,
  };
}

export function buildSignalFunnelDashboard(
  observations: SignalFunnelObservation[],
  asOf: number
): SignalFunnelDashboard {
  return {
    asOf,
    windows: {
      "24H": summarizeWindow(observations, "24H", asOf),
      "7D": summarizeWindow(observations, "7D", asOf),
      "30D": summarizeWindow(observations, "30D", asOf),
    },
  };
}

function summarizeWindow(
  observations: SignalFunnelObservation[],
  window: SignalFunnelWindow,
  asOf: number
): SignalFunnelSummary {
  const from = asOf - SIGNAL_FUNNEL_WINDOW_MS[window];
  const filtered = observations.filter(
    (item) => item.observedAt >= from && item.observedAt <= asOf
  );

  let previousCount: number | null = null;
  const stageStats = SIGNAL_FUNNEL_STAGES.map((stage) => {
    const count = filtered.filter((item) => item.passedStages.includes(stage)).length;
    const stat: SignalFunnelStageStat = {
      stage,
      count,
      conversionRate:
        previousCount === null || previousCount === 0
          ? null
          : round2((count / previousCount) * 100),
      dropOff: previousCount === null ? 0 : Math.max(0, previousCount - count),
    };
    previousCount = count;
    return stat;
  });

  const rejected = filtered.filter((item) => item.rejectionCode !== null);
  const rejectionMap = new Map<string, { stage: SignalFunnelStage; count: number }>();
  for (const item of rejected) {
    const code = item.rejectionCode!;
    const stage = item.rejectionStage ?? item.deepestStage;
    const current = rejectionMap.get(code);
    rejectionMap.set(code, {
      stage,
      count: (current?.count ?? 0) + 1,
    });
  }

  const rejectionReasons = [...rejectionMap.entries()]
    .map(([code, value]) => ({
      code,
      stage: value.stage,
      count: value.count,
      percentage:
        rejected.length === 0 ? 0 : round2((value.count / rejected.length) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  const regimeMap = new Map<string, { observations: number; executions: number }>();
  for (const item of filtered) {
    const regime = item.regime ?? "UNCLASSIFIED";
    const current = regimeMap.get(regime) ?? { observations: 0, executions: 0 };
    current.observations += 1;
    if (item.passedStages.includes("EXECUTE")) current.executions += 1;
    regimeMap.set(regime, current);
  }

  const regimeStats = [...regimeMap.entries()]
    .map(([regime, value]) => ({
      regime,
      observations: value.observations,
      executions: value.executions,
      executionRate:
        value.observations === 0
          ? 0
          : round2((value.executions / value.observations) * 100),
    }))
    .sort((a, b) => b.observations - a.observations || a.regime.localeCompare(b.regime));

  return {
    window,
    from,
    to: asOf,
    observations: filtered.length,
    executions: filtered.filter((item) => item.passedStages.includes("EXECUTE")).length,
    stageStats,
    rejectionReasons,
    regimeStats,
  };
}

function resolveSetupRejection(
  pipeline: PipelineResult
): { code: string; detail: string } {
  const state = pipeline.setup.data.state;

  if (state === "INVALIDATED") {
    const evidence = findEvidence(pipeline.setup.conflicts, "ZONE_INVALIDATED");
    return {
      code: "SETUP_ZONE_INVALIDATED",
      detail:
        evidence?.description ??
        "The selected setup zone was invalidated before it became actionable.",
    };
  }

  if (state === "WATCH") {
    const lowScore = findEvidence(pipeline.setup.evidence, "SCORE_TOO_LOW");
    if (lowScore) {
      return {
        code: "SETUP_SCORE_TOO_LOW",
        detail: lowScore.description,
      };
    }
    const approaching = findEvidence(
      pipeline.setup.evidence,
      "APPROACHING_ZONE"
    );
    return {
      code: approaching ? "SETUP_APPROACHING_ZONE" : "SETUP_WATCH",
      detail:
        approaching?.description ??
        "Setup remains on watch and has not reached SETUP/ARMED state.",
    };
  }

  for (const [evidenceCode, rejectionCode] of [
    ["NO_ZONE", "SETUP_NO_ZONE"],
    ["NO_ZONE_ON_SIDE", "SETUP_NO_ZONE_ON_SIDE"],
    ["ZONE_TOO_FAR", "SETUP_ZONE_TOO_FAR"],
  ] as const) {
    const evidence = findEvidence(pipeline.setup.evidence, evidenceCode);
    if (evidence) {
      return { code: rejectionCode, detail: evidence.description };
    }
  }

  return {
    code: "SETUP_NONE",
    detail: "Setup Engine found no actionable setup zone.",
  };
}

function findEvidence(
  evidence: Array<{ code: string; description: string }>,
  code: string
): { code: string; description: string } | undefined {
  return evidence.find((item) => item.code === code);
}

function normalizeCode(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "UNKNOWN";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
