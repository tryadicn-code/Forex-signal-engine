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

const service = new PaperTradingService(
  new JsonFilePaperStore(storePath),
  DEFAULT_PAPER_TRADING_CONFIG
);

let lastPaperError: string | null = null;

function withLastError(data: PaperDashboardData): PaperDashboardData {
  return {
    ...data,
    persistenceError: lastPaperError ?? data.persistenceError,
  };
}

export async function readPaperDashboard(): Promise<PaperDashboardData> {
  return withLastError(await service.getDashboard());
}

export async function paperBalance(): Promise<number> {
  try {
    const balance = await service.getBalance();
    lastPaperError = null;
    return balance;
  } catch (error) {
    lastPaperError = error instanceof Error ? error.message : String(error);
    return DEFAULT_PAPER_TRADING_CONFIG.initialBalance;
  }
}

export async function processPaperSnapshot(
  snapshot: ScannerSnapshot
): Promise<PaperDashboardData> {
  try {
    const data = await service.processSnapshot(
      snapshot,
      runtimeMarketDataProvider()
    );
    lastPaperError = null;
    return data;
  } catch (error) {
    lastPaperError = error instanceof Error ? error.message : String(error);
    return readPaperDashboard();
  }
}

export async function resetPaperAccount(): Promise<PaperDashboardData> {
  try {
    const data = await service.reset();
    lastPaperError = null;
    return data;
  } catch (error) {
    lastPaperError = error instanceof Error ? error.message : String(error);
    return readPaperDashboard();
  }
}
