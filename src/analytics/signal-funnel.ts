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

/**
 * TRD-015: why a rejection happened.
 *
 * STRATEGY_REJECTION: the pipeline ran and deliberately did not advance
 *   (bias neutral, setup not actionable, trigger not confirmed, risk
 *   rejected, hard veto, execution WAIT/BLOCKED/INVALIDATED).
 *
 * INFRASTRUCTURE_FAILURE: the pipeline could not run or could not be
 *   evaluated (provider failure, invalid data, pipeline not available,
 *   trigger/risk/execution engine not evaluated).
 */
export type SignalFunnelFailureCategory =
  | "STRATEGY_REJECTION"
  | "INFRASTRUCTURE_FAILURE";
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
  /**
   * L8C-1: the deepest stage this observation successfully passed, i.e.
   * the last element of `passedStages`. This is NOT the same as
   * `rejectionStage`, which is the stage where the observation was dropped.
   * For a rejected observation the two are adjacent (rejectionStage follows
   * deepestStage in SIGNAL_FUNNEL_STAGES); for an executed observation
   * deepestStage is "EXECUTE" and rejectionStage is null.
   */
  deepestStage: SignalFunnelStage;
  /** Stage where the observation stopped progressing, or null on EXECUTE. */
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

export interface FailureCategoryStat {
  category: SignalFunnelFailureCategory;
  count: number;
  percentage: number;
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

export interface StrategyRoutingFunnelStat {
  preferredStrategyId: string;
  selectedStrategyId: string;
  routingMode: string;
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
  failureCategoryStats: FailureCategoryStat[];
  regimeStats: RegimeFunnelStat[];
  strategyRoutingStats: StrategyRoutingFunnelStat[];
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
    strategyId: result.strategyId ?? null,
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

  if (result.status === "ANALYSED_PARTIAL") {
    // TRD-004 B1: D1/H4/H1 usable, trigger timeframe unavailable. The data
    // gate passed for the timeframes we had; the trigger stage is where this
    // observation stops, with an infrastructure classification.
    passedStages.push("DATA_VALID");
    return reject(
      "TRIGGER_CONFIRMED",
      "TRIGGER_TIMEFRAME_UNAVAILABLE",
      result.reason
    );
  }

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
    if (result.strategyRouting?.mode === "NO_STRATEGY") {
      return reject(
        "BIAS_DIRECTIONAL",
        result.strategyRouting.reasonCode,
        result.strategyRouting.reason
      );
    }

    if (result.strategyId === "RANGE_MEAN_REVERSION") {
      const rangeReason = resolveRangeNeutralReason(pipeline);
      if (rangeReason !== null) {
        return reject(
          "BIAS_DIRECTIONAL",
          rangeReason.code,
          rangeReason.detail
        );
      }
    }

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
        result.strategyId === "BREAKOUT_RETEST"
          ? "TRIGGER_BREAKOUT_RETEST_INVALIDATED"
          : result.strategyId === "RANGE_MEAN_REVERSION"
            ? "TRIGGER_RANGE_BOUNDARY_INVALIDATED"
            : result.strategyId === "REVERSAL"
              ? "TRIGGER_REVERSAL_TRANSITION_INVALIDATED"
              : "TRIGGER_INVALIDATED",
        "Price moved beyond the setup invalidation level."
      );
    }

    if (result.strategyId === "BREAKOUT_RETEST") {
      const breakoutReason = resolveBreakoutTriggerRejection(pipeline);
      if (breakoutReason !== null) {
        return reject(
          "TRIGGER_CONFIRMED",
          breakoutReason.code,
          breakoutReason.detail
        );
      }
    }

    if (result.strategyId === "RANGE_MEAN_REVERSION") {
      const rangeReason = resolveRangeTriggerRejection(pipeline);
      if (rangeReason !== null) {
        return reject(
          "TRIGGER_CONFIRMED",
          rangeReason.code,
          rangeReason.detail
        );
      }
    }

    if (result.strategyId === "REVERSAL") {
      const reversalReason = resolveReversalTriggerRejection(pipeline);
      if (reversalReason !== null) {
        return reject(
          "TRIGGER_CONFIRMED",
          reversalReason.code,
          reversalReason.detail
        );
      }
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
    .sort((a, b) =>
      b.count - a.count ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
    );

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
    .sort((a, b) =>
      b.observations - a.observations ||
      (a.regime < b.regime ? -1 : a.regime > b.regime ? 1 : 0)
    );

  const strategyRoutingMap = new Map<
    string,
    {
      preferredStrategyId: string;
      selectedStrategyId: string;
      routingMode: string;
      observations: number;
      executions: number;
    }
  >();
  for (const item of filtered) {
    const preferredStrategyId =
      item.preferredStrategyId === undefined
        ? "LEGACY"
        : item.preferredStrategyId ?? "WAIT";
    const selectedStrategyId = item.strategyId ?? "NONE";
    const routingMode =
      item.routingMode === undefined ? "LEGACY" : item.routingMode ?? "LEGACY";
    const key = [preferredStrategyId, selectedStrategyId, routingMode].join("|");
    const current = strategyRoutingMap.get(key) ?? {
      preferredStrategyId,
      selectedStrategyId,
      routingMode,
      observations: 0,
      executions: 0,
    };
    current.observations += 1;
    if (item.passedStages.includes("EXECUTE")) current.executions += 1;
    strategyRoutingMap.set(key, current);
  }

  const strategyRoutingStats = [...strategyRoutingMap.values()]
    .map((value) => ({
      ...value,
      executionRate:
        value.observations === 0
          ? 0
          : round2((value.executions / value.observations) * 100),
    }))
    .sort(
      (a, b) =>
        b.observations - a.observations ||
        (a.preferredStrategyId < b.preferredStrategyId
          ? -1
          : a.preferredStrategyId > b.preferredStrategyId
            ? 1
            : 0)
    );

  const failureCategoryMap = new Map<SignalFunnelFailureCategory, number>();
  for (const item of rejected) {
    const category = classifyFailureCategory(item.rejectionCode);
    if (category === null) continue;
    failureCategoryMap.set(
      category,
      (failureCategoryMap.get(category) ?? 0) + 1
    );
  }
  const failureCategoryStats = [...failureCategoryMap.entries()]
    .map(([category, count]) => ({
      category,
      count,
      percentage:
        rejected.length === 0
          ? 0
          : round2((count / rejected.length) * 100),
    }))
    .sort((a, b) =>
      b.count - a.count ||
      (a.category < b.category ? -1 : a.category > b.category ? 1 : 0)
    );

  return {
    window,
    from,
    to: asOf,
    observations: filtered.length,
    executions: filtered.filter((item) => item.passedStages.includes("EXECUTE")).length,
    stageStats,
    rejectionReasons,
    regimeStats,
    strategyRoutingStats,
    failureCategoryStats,
  };
}

function resolveSetupRejection(
  pipeline: PipelineResult
): { code: string; detail: string } {
  const state = pipeline.setup.data.state;

  for (const [evidenceCode, rejectionCode] of [
    ["REVERSAL_VOLATILITY_UNAVAILABLE", "SETUP_REVERSAL_VOLATILITY_UNAVAILABLE"],
    ["REVERSAL_NO_CHASE", "SETUP_REVERSAL_NO_CHASE"],
    ["REVERSAL_WAITING_FOR_RETEST", "SETUP_REVERSAL_WAITING_FOR_RETEST"],
    ["REVERSAL_SETUP_SCORE_TOO_LOW", "SETUP_REVERSAL_SCORE_TOO_LOW"],
    ["REVERSAL_REGIME_REQUIRED", "SETUP_REVERSAL_REGIME_REQUIRED"],
    ["REVERSAL_CHOCH_MISSING", "SETUP_REVERSAL_CHOCH_MISSING"],
    ["REVERSAL_CHOCH_STALE", "SETUP_REVERSAL_CHOCH_STALE"],
    ["REVERSAL_EXHAUSTION_LEVEL_MISSING", "SETUP_REVERSAL_EXHAUSTION_LEVEL_MISSING"],
    ["REVERSAL_SWEEP_MISSING", "SETUP_REVERSAL_SWEEP_MISSING"],
    ["RANGE_SETUP_SCORE_TOO_LOW", "SETUP_RANGE_SCORE_TOO_LOW"],
    ["RANGE_MIDPOINT_WAIT", "SETUP_RANGE_MIDPOINT_WAIT"],
    ["BREAKOUT_REGIME_REQUIRED", "SETUP_BREAKOUT_REGIME_REQUIRED"],
    ["BREAKOUT_DIRECTION_UNRESOLVED", "SETUP_BREAKOUT_DIRECTION_UNRESOLVED"],
    ["BREAKOUT_LEVEL_NOT_CONFIRMED", "SETUP_BREAKOUT_LEVEL_NOT_CONFIRMED"],
    ["BREAKOUT_SETUP_SCORE_TOO_LOW", "SETUP_BREAKOUT_SCORE_TOO_LOW"],
    ["BREAKOUT_NO_CHASE", "SETUP_BREAKOUT_NO_CHASE"],
    ["BREAKOUT_WAITING_FOR_RETEST", "SETUP_BREAKOUT_WAITING_FOR_RETEST"],
  ] as const) {
    const evidence = findEvidence(pipeline.setup.evidence, evidenceCode);
    if (evidence) {
      return { code: rejectionCode, detail: evidence.description };
    }
  }

  const reversalInvalidated = findEvidence(
    pipeline.setup.conflicts,
    "REVERSAL_EXHAUSTION_INVALIDATED"
  );
  if (reversalInvalidated) {
    return {
      code: "SETUP_REVERSAL_EXHAUSTION_INVALIDATED",
      detail: reversalInvalidated.description,
    };
  }

  const rangeInvalidated = findEvidence(
    pipeline.setup.conflicts,
    "RANGE_BREAKOUT_DETECTED"
  );
  if (rangeInvalidated) {
    return {
      code: "SETUP_RANGE_BREAKOUT_DETECTED",
      detail: rangeInvalidated.description,
    };
  }

  const breakoutInvalidated = findEvidence(
    pipeline.setup.conflicts,
    "BREAKOUT_RETEST_INVALIDATED"
  );
  if (breakoutInvalidated) {
    return {
      code: "SETUP_BREAKOUT_RETEST_INVALIDATED",
      detail: breakoutInvalidated.description,
    };
  }

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

function resolveRangeNeutralReason(
  pipeline: PipelineResult
): { code: string; detail: string } | null {
  for (const [evidenceCode, rejectionCode] of [
    ["RANGE_REGIME_REQUIRED", "RANGE_REGIME_REQUIRED"],
    ["RANGE_VOLATILITY_UNAVAILABLE", "RANGE_VOLATILITY_UNAVAILABLE"],
    ["RANGE_BOUNDARIES_UNCONFIRMED", "RANGE_BOUNDARIES_UNCONFIRMED"],
    ["RANGE_TOO_NARROW", "RANGE_TOO_NARROW"],
    ["RANGE_TOO_WIDE", "RANGE_TOO_WIDE"],
    ["RANGE_MIDPOINT_WAIT", "RANGE_MIDPOINT_WAIT"],
  ] as const) {
    const evidence = findEvidence(pipeline.setup.evidence, evidenceCode);
    if (evidence) {
      return { code: rejectionCode, detail: evidence.description };
    }
  }
  const breakout = findEvidence(
    pipeline.setup.conflicts,
    "RANGE_BREAKOUT_DETECTED"
  );
  return breakout
    ? {
        code: "RANGE_BREAKOUT_DETECTED",
        detail: breakout.description,
      }
    : null;
}

function resolveRangeTriggerRejection(
  pipeline: PipelineResult
): { code: string; detail: string } | null {
  const conflicts = pipeline.trigger?.conflicts ?? [];
  for (const [conflictCode, rejectionCode] of [
    ["RANGE_BOUNDARY_REJECTION_MISSING", "TRIGGER_RANGE_BOUNDARY_REJECTION_MISSING"],
    ["RANGE_REJECTION_QUALITY_LOW", "TRIGGER_RANGE_REJECTION_QUALITY_LOW"],
    ["RANGE_STRUCTURE_TURN_MISSING", "TRIGGER_RANGE_STRUCTURE_TURN_MISSING"],
  ] as const) {
    const conflict = findEvidence(conflicts, conflictCode);
    if (conflict) {
      return { code: rejectionCode, detail: conflict.description };
    }
  }
  return null;
}

function resolveReversalTriggerRejection(
  pipeline: PipelineResult
): { code: string; detail: string } | null {
  const conflicts = pipeline.trigger?.conflicts ?? [];
  for (const [conflictCode, rejectionCode] of [
    ["REVERSAL_RETEST_MISSING", "TRIGGER_REVERSAL_RETEST_MISSING"],
    ["REVERSAL_REJECTION_QUALITY_LOW", "TRIGGER_REVERSAL_REJECTION_QUALITY_LOW"],
    ["REVERSAL_STRUCTURE_TURN_MISSING", "TRIGGER_REVERSAL_STRUCTURE_TURN_MISSING"],
  ] as const) {
    const conflict = findEvidence(conflicts, conflictCode);
    if (conflict) {
      return { code: rejectionCode, detail: conflict.description };
    }
  }
  return null;
}

function resolveBreakoutTriggerRejection(
  pipeline: PipelineResult
): { code: string; detail: string } | null {
  const conflicts = pipeline.trigger?.conflicts ?? [];
  for (const [conflictCode, rejectionCode] of [
    ["BREAKOUT_RETEST_NOT_HELD", "TRIGGER_BREAKOUT_RETEST_NOT_HELD"],
    ["BREAKOUT_RESUMPTION_MISSING", "TRIGGER_BREAKOUT_RESUMPTION_MISSING"],
    ["BREAKOUT_CONFIRMATION_INCOMPLETE", "TRIGGER_BREAKOUT_CONFIRMATION_INCOMPLETE"],
  ] as const) {
    const conflict = findEvidence(conflicts, conflictCode);
    if (conflict) {
      return { code: rejectionCode, detail: conflict.description };
    }
  }
  return null;
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

/**
 * TRD-015: classify a rejection code as infrastructure failure or strategy
 * rejection. Returns null for null input (i.e. an executed observation).
 *
 * Infrastructure codes are those where the pipeline could not produce a
 * result for the symbol at all (data problem or engine not evaluated). Every
 * other code — including deliberate WAIT and all strategy gate rejections —
 * is a strategy rejection.
 */
const INFRASTRUCTURE_REJECTION_CODES: ReadonlySet<string> = new Set([
  "PROVIDER_FAILURE",
  "INVALID_DATA",
  "ANALYSIS_ERROR",
  "PIPELINE_NOT_AVAILABLE",
  "TRIGGER_TIMEFRAME_UNAVAILABLE",
  "TRIGGER_NOT_EVALUATED",
  "RISK_NOT_EVALUATED",
  "EXECUTION_NOT_EVALUATED",
]);

export function classifyFailureCategory(
  rejectionCode: string | null
): SignalFunnelFailureCategory | null {
  if (rejectionCode === null) return null;
  return INFRASTRUCTURE_REJECTION_CODES.has(rejectionCode)
    ? "INFRASTRUCTURE_FAILURE"
    : "STRATEGY_REJECTION";
}
