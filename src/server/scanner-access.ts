/**
 * Server-side scanner access (Section 22 spec).
 *
 * THE COMPOSITION ROOT. This is the only module that decides which provider the
 * application runs against, and the only place a provider is constructed. UI
 * components and route handlers reach the scanner through this layer:
 *
 *   UI  ->  scanner-access  ->  ScannerApi  ->  ScannerService  ->  provider
 *                                                                 ->  Phase 1
 *
 * No component ever imports a provider, and no component runs the Phase 1
 * engines. Everything returned here is already-computed scanner output.
 */

import "server-only";

import { ScannerApi } from "@/scanner/scanner-api";
import type { SignalView } from "@/scanner/scanner-api";
import {
  MockMarketDataProvider,
  MOCK_ANALYSIS_ANCHOR,
} from "@/providers/market-data/mock-provider";
import { DEMO_SCENARIOS } from "@/config/demo-scenarios";
import { isTerminalState } from "@/lib/signal-meta";
import type { ScannerHealth, ScannerSnapshot } from "@/scanner/scanner-result";
import type { SignalStateTransition } from "@/types/market-data";

/**
 * Deterministic anchor for the dashboard's initial scan. Analysing this moment
 * reproduces identical engine output on every request, so the first paint is
 * stable and replayable rather than depending on the build clock.
 */
export const DEFAULT_SCAN_ASOF = MOCK_ANALYSIS_ANCHOR;

/** Number of recent transitions the audit feed shows by default. */
const RECENT_TRANSITIONS = 12;

/** Everything the dashboard needs in one read. */
export interface DashboardData {
  snapshot: ScannerSnapshot | null;
  health: ScannerHealth | null;
  activeSignals: SignalView[];
  allSignals: SignalView[];
  recentTransitions: SignalStateTransition[];
  /** Transition history per signal id, for the signal detail panel. */
  signalHistory: Record<string, SignalStateTransition[]>;
  /** Set when the scan cycle itself failed, so the UI can show it honestly. */
  scanError: string | null;
}

let api: ScannerApi | null = null;

/** The process-wide scanner instance, lazily wired to the configured provider. */
function scanner(): ScannerApi {
  if (!api) {
    api = new ScannerApi(
      { providerId: "mock" },
      { marketData: new MockMarketDataProvider({ scenarios: DEMO_SCENARIOS }) }
    );
  }
  return api;
}

/**
 * Project the scanner's current state into the dashboard view.
 *
 * Pure presentation over already-computed output: this never runs an engine,
 * it only reads the repositories the last scan already filled.
 */
function dashboardView(inst: ScannerApi, scanError: string | null): DashboardData {
  const allSignals = inst.getAllSignals();
  const signalHistory: Record<string, SignalStateTransition[]> = {};
  for (const signal of allSignals) {
    signalHistory[signal.signalId] = inst.getSignalHistory(signal.signalId);
  }

  return {
    snapshot: inst.getLatestSnapshot(),
    health: inst.getHealth(),
    activeSignals: allSignals.filter((s) => !isTerminalState(s.state)),
    allSignals,
    recentTransitions: inst.getRecentTransitions(RECENT_TRANSITIONS),
    signalHistory,
    scanError,
  };
}

/**
 * Guarantee one scan has run and return the dashboard view of its output.
 *
 * The initial scan targets {@link DEFAULT_SCAN_ASOF} so the first paint is
 * deterministic; it is skipped when a scan already exists (a refresh already
 * happened).
 */
export async function readDashboard(
  asOf: number = DEFAULT_SCAN_ASOF
): Promise<DashboardData> {
  const inst = scanner();
  let scanError: string | null = null;

  if (!inst.getLatestSnapshot()) {
    try {
      await inst.runScan(asOf);
    } catch (error) {
      scanError = error instanceof Error ? error.message : String(error);
    }
  }

  return dashboardView(inst, scanError);
}

/**
 * Run one fresh cycle and return the dashboard view of the new output.
 *
 * The user-triggered refresh analyses the LIVE market time (the wall clock),
 * which the candle-aware mock turns into a genuinely newer series - so a manual
 * refresh is meaningful while the initial paint stays deterministic.
 */
export async function refreshScanner(asOf: number = Date.now()): Promise<DashboardData> {
  const inst = scanner();
  let scanError: string | null = null;
  try {
    await inst.runScan(asOf);
  } catch (error) {
    scanError = error instanceof Error ? error.message : String(error);
  }
  return dashboardView(inst, scanError);
}

/** The symbols the configured universe would analyse. */
export function listUniverse(): string[] {
  return scanner().listSymbols();
}
