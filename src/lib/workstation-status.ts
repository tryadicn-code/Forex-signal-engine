import type { SymbolScanResult } from "@/scanner/scanner-result";

export type WorkstationTone =
  | "ready"
  | "waiting"
  | "blocked"
  | "invalid"
  | "neutral";

export interface WorkstationStatus {
  headline: string;
  detail: string;
  tone: WorkstationTone;
}

export interface WorkstationStage {
  label: "Bias" | "Setup" | "Trigger" | "Risk" | "Execute";
  state: "done" | "current" | "pending" | "blocked";
}

function firstUsefulReason(result: SymbolScanResult): string | null {
  if (result.executionDetail?.triggeredVetoes.length) {
    return result.executionDetail.triggeredVetoes[0] ?? null;
  }
  if (result.riskDetail?.rejectionReason) {
    return result.riskDetail.rejectionReason;
  }
  if (result.executionDetail?.reasons.length) {
    return result.executionDetail.reasons[0] ?? null;
  }
  return result.reason || null;
}

export function workstationStatus(result: SymbolScanResult): WorkstationStatus {
  if (result.status !== "ANALYSED") {
    return {
      headline: "Data issue",
      detail: result.reason || "This pair could not be analysed.",
      tone: "blocked",
    };
  }

  if (
    result.executionDecision === "INVALIDATED" ||
    result.signalState === "INVALIDATED" ||
    result.setupState === "INVALIDATED" ||
    result.triggerState === "INVALIDATED"
  ) {
    return {
      headline: "Setup invalidated",
      detail: firstUsefulReason(result) ?? "The setup is no longer valid.",
      tone: "invalid",
    };
  }

  if (
    result.executionDecision === "BLOCKED" ||
    result.signalState === "BLOCKED"
  ) {
    return {
      headline: "Blocked",
      detail: firstUsefulReason(result) ?? "A safety or execution gate is blocking this setup.",
      tone: "blocked",
    };
  }

  if (
    result.executionDecision === "EXECUTE" &&
    result.signalState === "EXECUTE"
  ) {
    return {
      headline: "Ready",
      detail: "Engine decision and signal lifecycle are aligned.",
      tone: "ready",
    };
  }

  if (result.executionDecision === "EXECUTE") {
    return {
      headline: "Waiting for lifecycle",
      detail: `Engine is EXECUTE; lifecycle is ${result.signalState ?? "not executable"}.`,
      tone: "waiting",
    };
  }

  if (result.triggerState === "CONFIRMED") {
    return {
      headline: result.riskDetail?.approved
        ? "Waiting for execution gate"
        : "Trigger confirmed",
      detail: result.riskDetail?.approved
        ? "Trigger and risk are confirmed; engine is not executable yet."
        : "Trigger is confirmed; risk or execution confirmation is still pending.",
      tone: "waiting",
    };
  }

  if (result.setupState === "ARMED" || result.signalState === "ARMED") {
    return {
      headline: "Waiting for trigger",
      detail: "Bias and setup are established; trigger confirmation is still required.",
      tone: "waiting",
    };
  }

  if (result.setupState === "SETUP" || result.signalState === "SETUP") {
    return {
      headline: "Setup forming",
      detail: "A setup exists but is not armed yet.",
      tone: "neutral",
    };
  }

  if (result.signalState === "WATCH" || result.setupState === "WATCH") {
    return {
      headline: "Watching",
      detail: "Conditions are being monitored for a valid setup.",
      tone: "neutral",
    };
  }

  return {
    headline: "Scanning",
    detail: "No actionable setup is confirmed yet.",
    tone: "neutral",
  };
}

export function workstationStages(result: SymbolScanResult): WorkstationStage[] {
  const failed = result.status !== "ANALYSED";
  const invalid =
    result.executionDecision === "INVALIDATED" ||
    result.signalState === "INVALIDATED";
  const blocked =
    failed ||
    invalid ||
    result.executionDecision === "BLOCKED" ||
    result.signalState === "BLOCKED";

  const biasDone =
    result.biasDirection === "LONG" || result.biasDirection === "SHORT";
  const setupDone =
    result.setupState === "ARMED" ||
    result.signalState === "ARMED" ||
    result.signalState === "TRIGGERED" ||
    result.signalState === "RISK_APPROVED" ||
    result.signalState === "EXECUTE";
  const triggerDone =
    result.triggerState === "CONFIRMED" ||
    result.signalState === "TRIGGERED" ||
    result.signalState === "RISK_APPROVED" ||
    result.signalState === "EXECUTE";
  const riskDone =
    result.riskDetail?.approved === true ||
    result.signalState === "RISK_APPROVED" ||
    result.signalState === "EXECUTE";
  const executeDone =
    result.executionDecision === "EXECUTE" &&
    result.signalState === "EXECUTE";

  const done = [biasDone, setupDone, triggerDone, riskDone, executeDone];
  const labels: WorkstationStage["label"][] = [
    "Bias",
    "Setup",
    "Trigger",
    "Risk",
    "Execute",
  ];
  const firstPending = done.findIndex((value) => !value);

  return labels.map((label, index) => ({
    label,
    state: done[index]
      ? "done"
      : blocked && index === Math.max(0, firstPending)
        ? "blocked"
        : index === firstPending
          ? "current"
          : "pending",
  }));
}

export function stageGlyph(stage: WorkstationStage): string {
  if (stage.state === "done") return "?";
  if (stage.state === "blocked") return "?";
  if (stage.state === "current") return "?";
  return "�";
}

export function workstationToneClass(tone: WorkstationTone): string {
  switch (tone) {
    case "ready":
      return "text-emerald-300";
    case "waiting":
      return "text-amber-300";
    case "blocked":
      return "text-red-300";
    case "invalid":
      return "text-zinc-500";
    default:
      return "text-zinc-300";
  }
}
