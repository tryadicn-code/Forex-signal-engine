import { createHash } from "node:crypto";
import type { NotificationConfig } from "@/config/notifications";
import type { AlertCandidate, AlertState } from "@/notifications/types";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { SymbolScanResult } from "@/scanner/scanner-result";

export function detectAlertCandidate(
  result: SymbolScanResult,
  release: ReleaseRuntimeState,
  config: NotificationConfig,
  detectedAt: number = Date.now()
): AlertCandidate | null {
  if (
    result.status !== "ANALYSED" ||
    !result.signalId ||
    (result.biasDirection !== "LONG" &&
      result.biasDirection !== "SHORT")
  ) {
    return null;
  }

  const state = classifyAlertState(result, config);
  if (!state || !stateEnabled(state, config)) return null;

  const releaseVersion = release.version ?? "built-in";
  const activationAt = release.activationAt ?? 0;
  const key = [
    "alert",
    releaseVersion,
    activationAt,
    result.signalId,
    state,
  ].join(":");

  return {
    key,
    signalId: result.signalId,
    strategyId: result.strategyId ?? null,
    symbol: result.symbol,
    direction: result.biasDirection,
    state,
    detectedAt,
    strategyVersion: releaseVersion,
    strategyActivationAt: activationAt,
    latestPrice: result.latestPrice,
    biasScore: result.biasScore,
    setupScore: result.setupScore,
    triggerScore: result.triggerScore,
    riskReward: result.riskReward,
    entryPrice: result.riskDetail?.entryPrice ?? null,
    stopLoss: result.riskDetail?.stopLoss ?? null,
    takeProfit1: result.riskDetail?.takeProfit1 ?? null,
    riskPercent: result.riskDetail?.riskPercent ?? null,
    positionSize:
      result.riskDetail?.positionSize ??
      result.positionSize ??
      null,
    freshness: result.freshness,
    waitingFor: waitingConditions(result),
    blockers: [
      ...(result.executionDetail?.triggeredVetoes ?? []),
      ...(result.executionDecision === "BLOCKED"
        ? result.executionDetail?.reasons ?? []
        : []),
    ],
  };
}

export function classifyAlertState(
  result: SymbolScanResult,
  config: NotificationConfig
): AlertState | null {
  if (
    result.executionDecision === "INVALIDATED" ||
    result.signalState === "INVALIDATED" ||
    result.setupState === "INVALIDATED" ||
    result.triggerState === "INVALIDATED"
  ) {
    return "INVALIDATED";
  }

  if (
    result.executionDecision === "BLOCKED" ||
    result.signalState === "BLOCKED"
  ) {
    return "BLOCKED";
  }

  if (
    result.executionDecision === "EXECUTE" &&
    result.signalState === "EXECUTE" &&
    result.freshness === "FRESH" &&
    result.riskDetail?.approved === true
  ) {
    return "EXECUTE_READY";
  }

  if (isNearExecute(result, config)) {
    return "NEAR_EXECUTE";
  }

  if (
    result.signalState === "WATCH" ||
    result.signalState === "SETUP" ||
    result.signalState === "ARMED"
  ) {
    return "WATCH";
  }

  return null;
}

function isNearExecute(
  result: SymbolScanResult,
  config: NotificationConfig
): boolean {
  return (
    result.freshness === "FRESH" &&
    result.executionDecision === "WAIT" &&
    result.setupState === "ARMED" &&
    result.triggerState === "WAITING" &&
    (result.executionDetail?.triggeredVetoes.length ?? 0) === 0 &&
    Math.abs(result.biasScore ?? 0) >=
      config.nearExecuteBiasScore &&
    (result.setupScore ?? 0) >= config.nearExecuteSetupScore &&
    (result.triggerScore ?? 0) >= config.nearExecuteTriggerScore &&
    (result.riskReward === null ||
      result.riskReward >= config.nearExecuteMinRiskReward)
  );
}

function stateEnabled(
  state: AlertState,
  config: NotificationConfig
): boolean {
  switch (state) {
    case "WATCH":
      return config.watchEnabled;
    case "NEAR_EXECUTE":
      return config.nearExecuteEnabled;
    case "EXECUTE_READY":
      return config.executeEnabled;
    case "BLOCKED":
      return config.blockedEnabled;
    case "INVALIDATED":
      return config.invalidatedEnabled;
  }
}

function waitingConditions(result: SymbolScanResult): string[] {
  const waiting = (
    result.executionDetail?.conditions
      .filter((condition) => !condition.passed)
      .map((condition) => condition.name) ?? []
  );
  if (
    result.triggerState === "WAITING" &&
    !waiting.includes("TRIGGER_CONFIRMATION")
  ) {
    waiting.unshift("TRIGGER_CONFIRMATION");
  }
  if (
    result.triggerState === "WAITING" &&
    result.riskDetail === null &&
    !waiting.includes("RISK_EVALUATION")
  ) {
    waiting.push("RISK_EVALUATION");
  }
  return [...new Set(waiting)].slice(0, 6);
}

export function alertRecordId(key: string): string {
  return "alert-" +
    createHash("sha256").update(key).digest("hex").slice(0, 24);
}
