/**
 * Signal state machine (Section 18 spec).
 *
 * The lifecycle is EXPLICIT and VALIDATED: states move only along legal edges,
 * and the target state is DERIVED from Phase 1 engine outputs - the state
 * machine never re-decides a setup, a trigger, a risk assessment or an
 * execution gate. It only records what the engines already concluded.
 *
 * Core progression:
 *   DISCOVERED -> WATCH -> SETUP -> ARMED -> TRIGGERED -> RISK_APPROVED -> EXECUTE
 *
 * Alternative states: BLOCKED, INVALIDATED, CLOSED.
 *
 * BLOCKED means a safety gate (risk guard, stale data, spread) currently stops
 * execution. INVALIDATED and CLOSED are terminal for that lifecycle - a signal
 * in either state needs a FRESH setup/trigger to start over, it never silently
 * returns to EXECUTE.
 *
 * TTL expiry is recorded as a transition to the terminal CLOSED state carrying
 * the reason "TTL_EXPIRED". Phase 1's SignalState has no dedicated EXPIRED label
 * (Phase 1 is locked), so expiry is expressed through CLOSED + reason rather than
 * by extending the engine's own state vocabulary. The reason is what keeps
 * "expired" distinguishable from "managed out" in the transition history.
 */

import type { SignalState } from "@/types/market";
import type {
  SignalIdentity,
  SignalStateTransition,
} from "@/types/market-data";
import type { PipelineResult } from "@/core/orchestrator";

/** Machine-readable reason string used for TTL expiry transitions. */
export const TTL_EXPIRED_REASON = "TTL_EXPIRED";

/**
 * The legal edges. Anything not listed here is rejected, so a call like
 * WATCH -> EXECUTE can never succeed just because a caller asked for it.
 */
const LEGAL_TRANSITIONS: Record<SignalState, readonly SignalState[]> = {
  DISCOVERED: ["WATCH", "SETUP", "ARMED", "TRIGGERED", "BLOCKED", "INVALIDATED", "CLOSED"],
  WATCH: ["SETUP", "ARMED", "TRIGGERED", "BLOCKED", "INVALIDATED", "CLOSED"],
  SETUP: ["ARMED", "TRIGGERED", "BLOCKED", "INVALIDATED", "CLOSED", "WATCH"],
  ARMED: ["TRIGGERED", "BLOCKED", "INVALIDATED", "CLOSED", "WATCH"],
  TRIGGERED: ["RISK_APPROVED", "BLOCKED", "INVALIDATED", "CLOSED"],
  RISK_APPROVED: ["EXECUTE", "BLOCKED", "INVALIDATED", "CLOSED"],
  EXECUTE: ["BLOCKED", "INVALIDATED", "MANAGE", "CLOSED"],
  BLOCKED: ["WATCH", "SETUP", "ARMED", "TRIGGERED", "RISK_APPROVED", "INVALIDATED", "CLOSED"],
  INVALIDATED: ["DISCOVERED"],
  MANAGE: ["CLOSED", "INVALIDATED"],
  CLOSED: [],
};

export function isLegalTransition(
  from: SignalState,
  to: SignalState
): boolean {
  if (from === to) return true;
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionResult {
  state: SignalState;
  transition: SignalStateTransition | null;
  legal: boolean;
  /** Reason the transition was refused, when illegal. */
  refusalReason?: string;
}

/**
 * Find a shortest legal path between lifecycle states.
 *
 * Scanner cycles are snapshots, not an event stream: the engine can move from
 * WATCH to EXECUTE between two scans. Rather than permitting an illegal jump,
 * the lifecycle catches up through the existing legal edges. Terminal CLOSED
 * remains terminal because no path leaves it.
 */
export function findLegalTransitionPath(
  from: SignalState,
  to: SignalState
): SignalState[] | null {
  if (from === to) return [];

  const queue: Array<{ state: SignalState; path: SignalState[] }> = [
    { state: from, path: [] },
  ];
  const visited = new Set<SignalState>([from]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of LEGAL_TRANSITIONS[current.state] ?? []) {
      if (visited.has(next)) continue;
      const path = [...current.path, next];
      if (next === to) return path;
      visited.add(next);
      queue.push({ state: next, path });
    }
  }

  return null;
}

/**
 * Apply a proposed transition. Refuses anything not on the legal edge list and
 * returns the unchanged state plus a refusal reason, so illegal jumps are
 * observable rather than silently dropped.
 */
export function transitionSignal(
  current: SignalState,
  target: SignalState,
  reason: string,
  now: number
): TransitionResult {
  if (current === target) {
    return { state: current, transition: null, legal: true };
  }
  if (!isLegalTransition(current, target)) {
    return {
      state: current,
      transition: null,
      legal: false,
      refusalReason: `Illegal transition ${current} -> ${target}.`,
    };
  }
  const transition: SignalStateTransition = {
    signalId: "",
    symbol: "",
    previousState: current,
    newState: target,
    timestamp: now,
    reason,
  };
  return { state: target, transition, legal: true };
}

export interface DeriveStateInput {
  pipeline: PipelineResult;
  /** True when a required timeframe is STALE; data quality gates execution. */
  stale?: boolean;
  /**
   * True when a cross-currency conversion could not be resolved. The Risk Engine
   * already rejects in that case; this keeps the lifecycle label consistent.
   */
  conversionUnresolved?: boolean;
  /**
   * True when the bar-aware TTL has lapsed for the setup or the trigger. Expiry
   * outranks every progress state: an expired candidate must never be re armed
   * by a later, weaker reading.
   */
  expired?: boolean;
  /** Machine-readable reason the TTL lapsed, surfaced in the transition record. */
  expiredReason?: string;
}

/**
 * Derive the lifecycle state from Phase 1 outputs.
 *
 * Priority is safety-first: INVALIDATED, expiry and BLOCKED outrank progress
 * states, so a broken, lapsed or gated setup is labelled before anything
 * optimistic. EXECUTE is only ever returned when the Execution Engine actually
 * decided EXECUTE.
 */
export function deriveSignalState(input: DeriveStateInput): SignalState {
  const { pipeline, stale, conversionUnresolved, expired } = input;
  const execution = pipeline.execution?.data.decision;
  const setup = pipeline.setup.data.state;

  if (execution === "INVALIDATED" || setup === "INVALIDATED") {
    return "INVALIDATED";
  }

  // TTL expiry is terminal: no later progress state may revive the lifecycle.
  if (expired) {
    return "CLOSED";
  }

  // Stale data or an unresolvable conversion are safety failures, not WAIT.
  if (execution === "BLOCKED" || stale || conversionUnresolved) {
    return "BLOCKED";
  }

  if (execution === "EXECUTE") {
    return "EXECUTE";
  }

  return deriveProgressState(input);
}

/**
 * The non-safety progression, isolated so the safety branches above stay
 * readable and clearly take precedence.
 */
function deriveProgressState(input: DeriveStateInput): SignalState {
  const { pipeline } = input;
  const risk = pipeline.risk?.data;
  const trigger = pipeline.trigger?.data.state;
  const setup = pipeline.setup.data.state;

  if (risk?.approved) {
    return "RISK_APPROVED";
  }

  if (trigger === "CONFIRMED") {
    return "TRIGGERED";
  }

  if (setup === "ARMED") return "ARMED";
  if (setup === "SETUP") return "SETUP";
  if (setup === "WATCH") return "WATCH";

  if (pipeline.bias.data.direction !== "NEUTRAL") {
    return "WATCH";
  }

  return "DISCOVERED";
}

/**
 * The machine-readable reason the derived state was reached, so transition
 * history carries evidence rather than a bare label.
 */
export function deriveStateReason(input: DeriveStateInput): string {
  const { pipeline, stale, conversionUnresolved, expired, expiredReason } = input;
  const execution = pipeline.execution?.data.decision;
  const setup = pipeline.setup.data.state;
  const trigger = pipeline.trigger?.data.state;

  if (execution === "INVALIDATED" || setup === "INVALIDATED") {
    return "Setup structure invalidated by the Setup/Execution Engine.";
  }
  if (expired) {
    return expiredReason ?? "Bar-aware TTL lapsed for the setup or trigger; the lifecycle is closed.";
  }
  if (stale) {
    return "A required timeframe is stale; execution is data-gated.";
  }
  if (conversionUnresolved) {
    return "Quote-to-account conversion could not be resolved; risk is rejected.";
  }
  if (execution === "BLOCKED") {
    return "Execution Engine returned BLOCKED (risk guard, spread or veto).";
  }
  if (execution === "EXECUTE") {
    return "All Phase 1 gates passed: setup, trigger and risk.";
  }
  if (pipeline.risk?.data.approved) {
    return "Risk Engine approved the entry candidate.";
  }
  if (trigger === "CONFIRMED") {
    return "Trigger Engine confirmed an entry; risk assessment pending.";
  }
  if (setup === "ARMED") {
    return "Price entered the setup zone; awaiting trigger confirmation.";
  }
  if (setup === "SETUP") {
    return "Setup Engine located a valid zone.";
  }
  if (setup === "WATCH") {
    return "Price approaching a candidate zone.";
  }
  if (pipeline.bias.data.direction !== "NEUTRAL") {
    return `Bias is ${pipeline.bias.data.label} but no setup yet.`;
  }
  return "Symbol discovered; bias is neutral.";
}

/** Attach identity to a transition record produced by {@link transitionSignal}. */
export function attachIdentity(
  transition: SignalStateTransition | null,
  identity: SignalIdentity
): SignalStateTransition | null {
  if (!transition) return null;
  return {
    ...transition,
    signalId: identity.signalId,
    symbol: identity.symbol,
  };
}
