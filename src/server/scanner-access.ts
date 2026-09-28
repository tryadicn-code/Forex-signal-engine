/**
 * Server-side scanner access for the Phase 3 dashboard.
 *
 * This is the composition root. UI components and route handlers reach the
 * scanner through this layer:
 *
 * UI -> scanner-access -> ScannerApi -> ScannerService -> provider -> Phase 1
 *
 * No component constructs a provider or runs a Phase 1 engine directly.
 */

import "server-only";

import { ScannerApi } from "@/scanner/scanner-api";
import {
  MockMarketDataProvider,
  MOCK_ANALYSIS_ANCHOR,
} from "@/providers/market-data/mock-provider";
import { DEMO_SCENARIOS } from "@/config/demo-scenarios";
import { isTerminalState } from "@/lib/signal-meta";
import type { DashboardData } from "@/types/dashboard";

export const DEFAULT_SCAN_ASOF = MOCK_ANALYSIS_ANCHOR;
const RECENT_TRANSITIONS = 12;

let api: ScannerApi | null = null;

function scanner(): ScannerApi {
  if (!api) {
    api = new ScannerApi(
      { providerId: "mock" },
      { marketData: new MockMarketDataProvider({ scenarios: DEMO_SCENARIOS }) }
    );
  }
  return api;
}

function dashboardView(inst: ScannerApi, scanError: string | null): DashboardData {
  const allSignals = inst.getAllSignals();
  const signalHistory: DashboardData["signalHistory"] = {};

  for (const signal of allSignals) {
    signalHistory[signal.signalId] = inst.getSignalHistory(signal.signalId);
  }

  return {
    snapshot: inst.getLatestSnapshot(),
    health: inst.getHealth(),
    activeSignals: allSignals.filter((signal) => !isTerminalState(signal.state)),
    allSignals,
    recentTransitions: inst.getRecentTransitions(RECENT_TRANSITIONS),
    signalHistory,
    scanError,
  };
}

/**
 * Guarantee that an initial deterministic scan exists, then return a serializable
 * dashboard read model. Repeated reads do not rerun the engine.
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
 * Run one user-requested scan cycle and return the new dashboard read model.
 */
export async function refreshScanner(
  asOf: number = Date.now()
): Promise<DashboardData> {
  const inst = scanner();
  let scanError: string | null = null;

  try {
    await inst.runScan(asOf);
  } catch (error) {
    scanError = error instanceof Error ? error.message : String(error);
  }

  return dashboardView(inst, scanError);
}

export function listUniverse(): string[] {
  return scanner().listSymbols();
}
