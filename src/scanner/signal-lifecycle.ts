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
 * Zone levels are quantized to whole pips so float noise never forks an id, and
 * the setup-origin timestamp is part of the key so a zone that repeats later in
 * time is a NEW lifecycle rather than a collision with the old one. No wall-clock
 * value is used: the id is a pure function of market data, so a replay reproduces
 * it exactly.
 */
export function computeSignalIdentity(
  params: ComputeSignalIdentityParams
): SignalIdentity {
  const lowPips = Math.round(params.zoneLow / params.pipSize);
  const highPips = Math.round(params.zoneHigh / params.pipSize);
  return {
    signalId: `${params.symbol}|${params.direction}|${params.originTimeframe}|${params.originTimestamp}|${lowPips}|${highPips}`,
    symbol: params.symbol,
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

/** Record a transition onto a lifecycle, returning an updated copy. */
export function recordTransition(
  lifecycle: SignalLifecycleState,
  transition: SignalStateTransition,
  now: number
): SignalLifecycleState {
  return {
    ...lifecycle,
    state: transition.newState,
    updatedAt: now,
    transitions: [...lifecycle.transitions, transition],
  };
}
