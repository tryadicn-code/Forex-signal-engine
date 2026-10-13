import type { SignalFunnelObservation } from "@/analytics/signal-funnel";

/**
 * TRD-RR-003 analytics: per-strategy breakdown of signal observations and
 * paper trading outcomes.
 *
 * Two data sources feed a single row per strategy:
 *   - signal observations: how many times the strategy was selected and how
 *     far each candidate got through the funnel.
 *   - paper trades: closed-trade outcomes attributed by engine.strategyId.
 *
 * The breakdown is deliberately a pure function so it can be recomputed from
 * a raw snapshot in tests without touching the store or the scanner.
 */

export interface StrategyBreakdownTrade {
  engine: {
    strategyId?: string | null;
  };
  realizedPnL: number;
  realizedR: number;
}

export interface StrategyBreakdownEntry {
  strategyId: string;
  /** Observations where this strategy was the active one. */
  signalObservations: number;
  /** Observations that reached TRIGGER_CONFIRMED or beyond. */
  reachedTrigger: number;
  /** Observations that reached RISK_APPROVED or beyond. */
  reachedRisk: number;
  /** Observations that reached EXECUTE. */
  reachedExecute: number;
  /** Closed paper trades attributed to this strategy. */
  closedTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  /** wins / closedTrades * 100, or null when closedTrades = 0. */
  winRate: number | null;
  /** Sum of realized P&L across closed trades. */
  netPnL: number;
  /** Sum of realized R across closed trades. */
  netR: number;
  /** netR / closedTrades, or null when closedTrades = 0. */
  avgR: number | null;
}

/**
 * Strategies the engine knows about. Any strategy not listed here is still
 * counted but sorted after the known ones, so a future strategy id surfaces
 * without a code change.
 */
export const KNOWN_STRATEGY_IDS = [
  "TREND_PULLBACK",
  "BREAKOUT_RETEST",
  "RANGE_MEAN_REVERSION",
  "REVERSAL",
] as const;

function emptyEntry(strategyId: string): StrategyBreakdownEntry {
  return {
    strategyId,
    signalObservations: 0,
    reachedTrigger: 0,
    reachedRisk: 0,
    reachedExecute: 0,
    closedTrades: 0,
    wins: 0,
    losses: 0,
    breakEven: 0,
    winRate: null,
    netPnL: 0,
    netR: 0,
    avgR: null,
  };
}

export function computeStrategyBreakdown(
  observations: readonly SignalFunnelObservation[],
  trades: readonly StrategyBreakdownTrade[]
): StrategyBreakdownEntry[] {
  const map = new Map<string, StrategyBreakdownEntry>();
  const ensure = (id: string): StrategyBreakdownEntry => {
    let entry = map.get(id);
    if (!entry) {
      entry = emptyEntry(id);
      map.set(id, entry);
    }
    return entry;
  };

  // Always surface the known strategies, even with zero activity, so the UI
  // does not silently hide a strategy that the router never selected.
  for (const id of KNOWN_STRATEGY_IDS) ensure(id);

  for (const obs of observations) {
    if (!obs.strategyId) continue;
    const entry = ensure(obs.strategyId);
    entry.signalObservations += 1;

    const stages = obs.passedStages;
    if (stages.includes("TRIGGER_CONFIRMED")) entry.reachedTrigger += 1;
    if (stages.includes("RISK_APPROVED")) entry.reachedRisk += 1;
    if (stages.includes("EXECUTE")) entry.reachedExecute += 1;
  }

  for (const trade of trades) {
    const id = trade.engine.strategyId ?? null;
    if (!id) continue;
    const entry = ensure(id);
    entry.closedTrades += 1;
    entry.netPnL += trade.realizedPnL;
    entry.netR += trade.realizedR;
    if (trade.realizedPnL > 0) entry.wins += 1;
    else if (trade.realizedPnL < 0) entry.losses += 1;
    else entry.breakEven += 1;
  }

  for (const entry of map.values()) {
    if (entry.closedTrades > 0) {
      entry.winRate = (entry.wins / entry.closedTrades) * 100;
      entry.avgR = entry.netR / entry.closedTrades;
    }
  }

  return [...map.values()].sort((a, b) => {
    const aKnown = (KNOWN_STRATEGY_IDS as readonly string[]).indexOf(a.strategyId);
    const bKnown = (KNOWN_STRATEGY_IDS as readonly string[]).indexOf(b.strategyId);
    if (aKnown >= 0 && bKnown >= 0) return aKnown - bKnown;
    if (aKnown >= 0) return -1;
    if (bKnown >= 0) return 1;
    return b.signalObservations - a.signalObservations;
  });
}