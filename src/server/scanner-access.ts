/**
 * Server-side scanner access.
 *
 * Runtime provider selection lives in server/runtime-market-data. Phase 1/2
 * remain provider-agnostic and receive only canonical market data.
 */

import "server-only";

import { ScannerApi } from "@/scanner/scanner-api";
import { isTerminalState } from "@/lib/signal-meta";
import type { DashboardData } from "@/types/dashboard";
import { resolveRuntimeSymbols } from "@/providers/market-data/runtime-provider";
import {
  primeRuntimeConversionRates,
  runtimeConversionResolver,
  runtimeDefaultAsOf,
  runtimeMarketDataProvider,
  runtimeProviderId,
  runtimeUsesLiveMarketData,
} from "@/server/runtime-market-data";
import {
  paperBalance,
  processPaperSnapshot,
  readPaperDashboard,
} from "@/server/paper-trading-access";

export const DEFAULT_SCAN_ASOF = runtimeDefaultAsOf();
const RECENT_TRANSITIONS = 12;

let api: ScannerApi | null = null;

function scanner(): ScannerApi {
  if (!api) {
    const symbols = resolveRuntimeSymbols();
    api = new ScannerApi(
      {
        providerId: runtimeProviderId(),
        executionMode: "PAPER",
        ...(symbols ? { symbols } : {}),
      },
      {
        marketData: runtimeMarketDataProvider(),
        conversionResolver: runtimeConversionResolver(),
      }
    );
  }
  return api;
}

async function dashboardView(inst: ScannerApi, scanError: string | null): Promise<DashboardData> {
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
    providerId: runtimeProviderId(),
    liveMarketData: runtimeUsesLiveMarketData(),
    paper: await readPaperDashboard(),
  };
}

async function runScanner(inst: ScannerApi, asOf: number): Promise<string | null> {
  try {
    inst.setRuntimeAccountBalance(await paperBalance());
    await primeRuntimeConversionRates(asOf, inst.config.account.currency);
    const snapshot = await inst.runScan(asOf);
    await processPaperSnapshot(snapshot);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function readDashboard(
  asOf: number = runtimeDefaultAsOf()
): Promise<DashboardData> {
  const inst = scanner();
  let scanError: string | null = null;

  if (!inst.getLatestSnapshot()) {
    scanError = await runScanner(inst, asOf);
  }

  return await dashboardView(inst, scanError);
}

export async function refreshScanner(
  asOf: number = runtimeDefaultAsOf()
): Promise<DashboardData> {
  const inst = scanner();
  const scanError = await runScanner(inst, asOf);
  return await dashboardView(inst, scanError);
}

export function listUniverse(): string[] {
  return scanner().listSymbols();
}
