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
import { DEFAULT_PAPER_TRADING_CONFIG } from "@/config/paper";

export const DEFAULT_SCAN_ASOF = runtimeDefaultAsOf();
const RECENT_TRANSITIONS = 12;

type ScannerRuntimeGlobal = typeof globalThis & {
  __fseScannerApi?: ScannerApi;
  __fseScanInFlight?: Promise<string | null>;
  __fseAutoScanTimer?: ReturnType<typeof setInterval>;
};

/**
 * Next.js may evaluate server modules in separate route bundles during
 * development. A module-local singleton can therefore split page reloads and
 * /api/scanner refreshes into different in-memory scanner repositories.
 *
 * Store the runtime scanner on globalThis so every server bundle in this Node
 * process reads and mutates the same snapshot/lifecycle source of truth.
 */
function scanner(): ScannerApi {
  const runtime = globalThis as ScannerRuntimeGlobal;
  if (!runtime.__fseScannerApi) {
    const symbols = resolveRuntimeSymbols();
    runtime.__fseScannerApi = new ScannerApi(
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
  return runtime.__fseScannerApi;
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
    automation: {
      enabled: DEFAULT_PAPER_TRADING_CONFIG.autoScanEnabled,
      scanIntervalMs: DEFAULT_PAPER_TRADING_CONFIG.autoScanIntervalMs,
      dashboardSyncIntervalMs: DEFAULT_PAPER_TRADING_CONFIG.dashboardSyncIntervalMs,
    },
  };
}

async function runScanner(inst: ScannerApi, asOf: number): Promise<string | null> {
  const runtime = globalThis as ScannerRuntimeGlobal;

  // Manual refresh and the automatic forward-test loop may fire together.
  // Coalesce them into one scan so market data, lifecycle transitions and paper
  // execution cannot race or create duplicate work.
  if (runtime.__fseScanInFlight) {
    return runtime.__fseScanInFlight;
  }

  const work = (async (): Promise<string | null> => {
    try {
      inst.setRuntimeAccountBalance(await paperBalance());
      await primeRuntimeConversionRates(asOf, inst.config.account.currency);
      const snapshot = await inst.runScan(asOf);
      await processPaperSnapshot(snapshot);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  })();

  runtime.__fseScanInFlight = work;

  try {
    return await work;
  } finally {
    if (runtime.__fseScanInFlight === work) {
      runtime.__fseScanInFlight = undefined;
    }
  }
}

function ensureAutoScanner(inst: ScannerApi): void {
  if (!DEFAULT_PAPER_TRADING_CONFIG.autoScanEnabled) return;

  const runtime = globalThis as ScannerRuntimeGlobal;
  if (runtime.__fseAutoScanTimer) return;

  const interval = Math.max(
    5_000,
    DEFAULT_PAPER_TRADING_CONFIG.autoScanIntervalMs
  );

  const timer = setInterval(() => {
    void runScanner(inst, runtimeDefaultAsOf());
  }, interval);

  // Do not keep the Node process alive solely because of the scanner timer.
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  runtime.__fseAutoScanTimer = timer;
}

export async function readDashboard(
  asOf: number = runtimeDefaultAsOf()
): Promise<DashboardData> {
  const inst = scanner();
  ensureAutoScanner(inst);
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
  ensureAutoScanner(inst);
  const scanError = await runScanner(inst, asOf);
  return await dashboardView(inst, scanError);
}

export function listUniverse(): string[] {
  return scanner().listSymbols();
}
