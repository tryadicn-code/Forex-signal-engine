import "server-only";

import { join } from "node:path";
import { DEFAULT_PAPER_TRADING_CONFIG } from "@/config/paper";
import { JsonFilePaperStore } from "@/paper/store";
import { PaperTradingService } from "@/paper/paper-trading-service";
import type { PaperDashboardData } from "@/paper/types";
import type { ScannerSnapshot } from "@/scanner/scanner-result";
import { runtimeMarketDataProvider } from "@/server/runtime-market-data";

const storePath =
  process.env.FSE_PAPER_STORE_PATH ??
  join(process.cwd(), ".data", "paper-trading.json");

type PaperRuntimeGlobal = typeof globalThis & {
  __fsePaperTradingService?: PaperTradingService;
  __fsePaperLastError?: string | null;
};

function paperService(): PaperTradingService {
  const runtime = globalThis as PaperRuntimeGlobal;
  if (!runtime.__fsePaperTradingService) {
    runtime.__fsePaperTradingService = new PaperTradingService(
      new JsonFilePaperStore(storePath),
      DEFAULT_PAPER_TRADING_CONFIG
    );
  }
  return runtime.__fsePaperTradingService;
}

function getLastPaperError(): string | null {
  return (globalThis as PaperRuntimeGlobal).__fsePaperLastError ?? null;
}

function setLastPaperError(error: string | null): void {
  (globalThis as PaperRuntimeGlobal).__fsePaperLastError = error;
}

function withLastError(data: PaperDashboardData): PaperDashboardData {
  return {
    ...data,
    persistenceError: getLastPaperError() ?? data.persistenceError,
  };
}

export async function readPaperDashboard(): Promise<PaperDashboardData> {
  return withLastError(await paperService().getDashboard());
}

export async function paperBalance(): Promise<number> {
  try {
    const balance = await paperService().getBalance();
    setLastPaperError(null);
    return balance;
  } catch (error) {
    setLastPaperError(error instanceof Error ? error.message : String(error));
    return DEFAULT_PAPER_TRADING_CONFIG.initialBalance;
  }
}

export async function processPaperSnapshot(
  snapshot: ScannerSnapshot
): Promise<PaperDashboardData> {
  try {
    const data = await paperService().processSnapshot(
      snapshot,
      runtimeMarketDataProvider()
    );
    setLastPaperError(null);
    return data;
  } catch (error) {
    setLastPaperError(error instanceof Error ? error.message : String(error));
    return readPaperDashboard();
  }
}

export async function resetPaperAccount(): Promise<PaperDashboardData> {
  try {
    const data = await paperService().reset();
    setLastPaperError(null);
    return data;
  } catch (error) {
    setLastPaperError(error instanceof Error ? error.message : String(error));
    return readPaperDashboard();
  }
}
