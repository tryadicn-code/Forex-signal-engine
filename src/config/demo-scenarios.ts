/**
 * Demo scanner scenarios (Phase 3).
 *
 * The dashboard is provider-independent: it only ever renders scanner output.
 * This file is the one place the demo deployment decides WHICH data the mock
 * provider should synthesise, so the presentation layer never references mock
 * specifics. A real provider replaces this wiring at the composition root and
 * nothing in src/components changes.
 *
 * The mix deliberately exercises the states the UI must distinguish: a live
 * trigger, an armed setup waiting for confirmation, a neutral pair, a stale
 * feed, and a failed symbol.
 */

import type { MockSymbolScenario } from "@/providers/market-data/mock-provider";

export const DEMO_SCENARIOS: Record<string, MockSymbolScenario> = {
  // Trend up, pullback into the zone, then a resumption that breaks structure:
  // the full setup -> trigger path.
  EURUSD: { direction: "UP", pullback: true, resumption: true },
  // Mirror image: a live short.
  GBPUSD: { direction: "DOWN", pullback: true, resumption: true },
  // Trend with a pullback but no resumption yet: an armed setup, no trigger.
  USDJPY: { direction: "UP", pullback: true },
  // Clean trend, no setup zone: directional bias, nothing actionable.
  AUDUSD: { direction: "UP" },
  // Clean downtrend, no setup zone.
  USDCAD: { direction: "DOWN" },
  // Ranging: no directional bias, no setup.
  NZDUSD: { direction: "RANGE" },
  EURJPY: { direction: "UP" },
  GBPJPY: { direction: "DOWN" },
  EURGBP: { direction: "RANGE" },
  AUDJPY: { direction: "UP" },
  EURAUD: { direction: "DOWN" },
  // Data-quality case: the feed is stale, so execution must be data-gated.
  USDCHF: { direction: "UP", stale: true },
  // A dead feed for one pair must not break the rest of the table.
  GBPAUD: { direction: "UP", fail: true },
};
