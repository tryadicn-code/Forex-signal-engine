/**
 * Signal lifecycle: deterministic identity + bar-aware TTL (Sections 19/20/30 spec).
 *
 * IDENTITY follows the setup, not the scan. The same live setup keeps the same
 * signalId across scan cycles, so the dashboard and the transition history see
 * continuity instead of a fresh signal on every tick. A new setup (different
 * zone, direction, symbol or origin time) gets a new id.
 *
 * TTL is BAR-AWARE, not wall-clock: a trigger created on M15 candle 100 with
 * ttlBars = 3 stays valid while candles 101, 102 and 103 close, and expires at
 * candle 104. Expiration is terminal for that lifecycle - it needs a fresh
 * trigger/setup and never silently returns to EXECUTE.
 */

import type { SignalState } from "@/types/market";
import type {
  SignalIdentity,
  SignalStateTransition,
} from "@/types/market-data";
import { closedBarsBefore } from "@/market-data/timeframe";
import type { Timeframe } from "@/types/market";

export interface ComputeSignalIdentityParams {
  symbol: string;
  /** Strategy owning this setup lifecycle. Optional for legacy callers. */
  strategyId?: string | null;
  direction: import("@/types/market").Direction;
  originTimeframe: Timeframe;
  /**
   * Market timestamp of the candle the setup/zone originated on (UTC epoch ms).
   * This is a real market time and it participates in identity: two occurrences
   * of the identical zone at different times are two different signals.
   */
  originTimestamp: number;
  zoneLow: number;
  zoneHigh: number;
  /** Pip size of the instrument, used to quantize zone levels. */
  pipSize: number;
}

/**
 * Deterministic identity from the setup's stable attributes.
 *
 * Zone levels are quantized to whole pips so float noise never forks an id.
 * Strategy is part of new multi-strategy identities so otherwise-identical
 * setups owned by different strategies cannot share a lifecycle. The
 * setup-origin timestamp is part of the key so a zone that repeats later in
 * time is a NEW lifecycle rather than a collision with the old one. No wall-clock
 * value is used: the id is a pure function of market data, so a replay reproduces
 * it exactly.
 */
export function computeSignalIdentity(
  params: ComputeSignalIdentityParams
): SignalIdentity {
  const lowPips = Math.round(params.zoneLow / params.pipSize);
  const highPips = Math.round(params.zoneHigh / params.pipSize);
  const strategySegment = params.strategyId
    ? `|strategy:${params.strategyId}`
    : "";
  return {
    signalId: `${params.symbol}${strategySegment}|${params.direction}|${params.originTimeframe}|${params.originTimestamp}|${lowPips}|${highPips}`,
    symbol: params.symbol,
    strategyId: params.strategyId ?? null,
    direction: params.direction,
    originTimeframe: params.originTimeframe,
    originTimestamp: params.originTimestamp,
    zoneLowPips: lowPips,
    zoneHighPips: highPips,
  };
}

export interface SignalLifecycleState {
  identity: SignalIdentity;
  state: SignalState;
  createdAt: number;
  updatedAt: number;
  /** Open time of the candle the current setup zone first appeared on. */
  setupOriginTimestamp: number | null;
  /** Open time of the candle the current trigger fired on. */
  triggerOriginTimestamp: number | null;
  transitions: SignalStateTransition[];
}

/**
 * Create a deterministic identity for a NEW trigger occurrence inside the same
 * setup zone. The setup identity remains intact in the fields; only signalId
 * gains the fresh trigger market timestamp as an occurrence discriminator.
 *
 * This is used only after the previous lifecycle is terminal CLOSED. It never
 * revives or overwrites the closed record.
 */
export function freshTriggerOccurrenceIdentity(
  base: SignalIdentity,
  triggerTimestamp: number
): SignalIdentity {
  return {
    ...base,
    signalId: `${base.signalId}|trigger:${triggerTimestamp}`,
  };
}

/**
 * A lifecycle in a terminal state (CLOSED or INVALIDATED) never revives. When
 * the engines observe a genuinely newer trigger inside the same setup zone,
 * that trigger gets a fresh occurrence id and starts a new lifecycle.
 *
 * H7-1: previously only CLOSED triggered a fresh occurrence. INVALIDATED was
 * documented as terminal but reused the same signalId, so a revalidated setup
 * could be silently revived under the old id. That aliased alerts, paper
 * orders, and broker idempotency keys across two genuinely distinct signals.
 */
export function resolveLifecycleIdentity(
  base: SignalIdentity,
  existing: SignalLifecycleState | null,
  observedTriggerTimestamp: number | null
): SignalIdentity {
  const terminal =
    existing?.state === "CLOSED" || existing?.state === "INVALIDATED";
  if (
    terminal &&
    observedTriggerTimestamp !== null &&
    (existing!.triggerOriginTimestamp === null ||
      observedTriggerTimestamp > existing!.triggerOriginTimestamp)
  ) {
    return freshTriggerOccurrenceIdentity(base, observedTriggerTimestamp);
  }
  return base;
}

export function shouldCloseSupersededLifecycle(input: {
  lifecycle: SignalLifecycleState;
  keepSignalId: string | null;
  activeStrategyId: string | null;
  closeSameStrategy: boolean;
}): boolean {
  const { lifecycle } = input;
  if (
    lifecycle.state === "CLOSED" ||
    lifecycle.state === "INVALIDATED" ||
    lifecycle.identity.signalId === input.keepSignalId
  ) {
    return false;
  }

  const lifecycleStrategy = lifecycle.identity.strategyId ?? null;
  const strategyChanged = lifecycleStrategy !== input.activeStrategyId;

  return (
    input.activeStrategyId === null ||
    strategyChanged ||
    input.closeSameStrategy
  );
}

export function createLifecycle(
  identity: SignalIdentity,
  now: number
): SignalLifecycleState {
  return {
    identity,
    state: "DISCOVERED",
    createdAt: now,
    updatedAt: now,
    setupOriginTimestamp: null,
    triggerOriginTimestamp: null,
    transitions: [],
  };
}

/**
 * Bar-aware expiration for the trigger.
 *
 * @param origin open time of the candle the trigger fired on
 * @param latestClosedOpen open time of the newest CLOSED trigger candle
 * @returns true when more than `ttlBars` closed candles have elapsed
 */
export function isTriggerExpired(
  origin: number | null,
  timeframe: Timeframe,
  latestClosedOpen: number,
  ttlBars: number
): boolean {
  if (origin === null) return false;
  const elapsed = closedBarsBefore(timeframe, origin, latestClosedOpen);
  return elapsed > ttlBars;
}

/** Bar-aware expiration for the setup zone, on the setup timeframe. */
export function isSetupExpired(
  origin: number | null,
  timeframe: Timeframe,
  latestClosedOpen: number,
  ttlBars: number
): boolean {
  if (origin === null) return false;
  const elapsed = closedBarsBefore(timeframe, origin, latestClosedOpen);
  return elapsed > ttlBars;
}

/**
 * H7-2: cap the per-lifecycle transition history.
 *
 * A long-lived signal scanned every 15 minutes can accumulate hundreds of
 * transitions. The cap keeps recent history (which the dashboard and audit
 * care about) without unbounded growth. The number is deliberately larger
 * than any legitimate single-signal history we have observed.
 */
export const MAX_TRANSITIONS_PER_LIFECYCLE = 200;

/** Record a transition onto a lifecycle, returning an updated copy. */
export function recordTransition(
  lifecycle: SignalLifecycleState,
  transition: SignalStateTransition,
  now: number
): SignalLifecycleState {
  const next = [...lifecycle.transitions, transition];
  const trimmed =
    next.length > MAX_TRANSITIONS_PER_LIFECYCLE
      ? next.slice(next.length - MAX_TRANSITIONS_PER_LIFECYCLE)
      : next;
  return {
    ...lifecycle,
    state: transition.newState,
    updatedAt: now,
    transitions: trimmed,
  };
}
