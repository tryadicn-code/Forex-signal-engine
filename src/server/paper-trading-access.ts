import "server-only";

import { DEFAULT_PAPER_TRADING_CONFIG } from "@/config/paper";
import { STORAGE_PATHS } from "@/config/storage";
import { JsonFilePaperStore } from "@/paper/store";
import { TransactionalPaperStore } from "@/transactional/domain-stores";
import {
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";
import { TransactionalPaperStore } from "@/transactional/domain-stores";
import {
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";
import { PaperTradingService } from "@/paper/paper-trading-service";
import type {
  PaperDashboardData,
  PaperReleaseIdentity,
  PaperStoreState,
} from "@/paper/types";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { ScannerSnapshot } from "@/scanner/scanner-result";
import { runtimeMarketDataProvider } from "@/server/runtime-market-data";

const storePath = STORAGE_PATHS.paper;

type PaperRuntimeGlobal = typeof globalThis & {
  __fsePaperTradingService?: PaperTradingService;
  __fsePaperLastError?: string | null;
};

function paperService(): PaperTradingService {
  const runtime = globalThis as PaperRuntimeGlobal;
  if (!runtime.__fsePaperTradingService) {
    runtime.__fsePaperTradingService = new PaperTradingService(
      sharedTransactionalMode()
        ? new TransactionalPaperStore(transactionalStore())
        : new JsonFilePaperStore(storePath),
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
    throw error;
  }
}

export async function processPaperSnapshot(
  snapshot: ScannerSnapshot,
  releaseRuntime?: ReleaseRuntimeState
): Promise<PaperDashboardData> {
  try {
    const data = await paperService().processSnapshot(
      snapshot,
      runtimeMarketDataProvider(),
      toPaperReleaseIdentity(releaseRuntime)
    );
    setLastPaperError(null);
    return data;
  } catch (error) {
    setLastPaperError(error instanceof Error ? error.message : String(error));
    throw error;
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


export async function readPaperState(): Promise<PaperStoreState> {
  return paperService().getStateSnapshot();
}

function toPaperReleaseIdentity(
  state?: ReleaseRuntimeState
): PaperReleaseIdentity | null {
  if (!state || state.status !== "ACTIVE") return null;
  return {
    strategyVersion: state.version,
    strategyManifestFingerprint: state.manifestFingerprint,
    strategySourceReportId: state.sourceReportId,
    strategyActivationAt: state.activationAt,
  };
}
