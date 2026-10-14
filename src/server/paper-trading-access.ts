import "server-only";

import { readPaperTradingConfig } from "@/server/paper-config-access";
import { STORAGE_PATHS } from "@/config/storage";
import { JsonFilePaperStore } from "@/paper/store";
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
  __fsePaperConfigIdentity?: string;
  __fsePaperLastError?: string | null;
};

/**
 * TRD-RR-007: paper service sekarang membaca config dari
 * .data/paper-config.json. Identity berubah saat config berubah, sehingga
 * service instance di-rebuild (state tetap di store, tidak ada yang hilang).
 */
async function paperService(): Promise<PaperTradingService> {
  const runtime = globalThis as PaperRuntimeGlobal;
  const { config, identity } = await readPaperTradingConfig();

  if (
    runtime.__fsePaperTradingService &&
    runtime.__fsePaperConfigIdentity === identity
  ) {
    return runtime.__fsePaperTradingService;
  }

  const store = sharedTransactionalMode()
    ? new TransactionalPaperStore(transactionalStore())
    : new JsonFilePaperStore(storePath);

  runtime.__fsePaperTradingService = new PaperTradingService(store, config);
  runtime.__fsePaperConfigIdentity = identity;
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
  const service = await paperService();
  return withLastError(await service.getDashboard());
}

export async function paperBalance(): Promise<number> {
  try {
    const service = await paperService();
    const balance = await service.getBalance();
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
    const service = await paperService();
    const data = await service.processSnapshot(
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

export async function closePaperPosition(
  positionId: string
): Promise<PaperDashboardData> {
  try {
    const service = await paperService();
    const data = await service.closePositionManually(
      positionId,
      runtimeMarketDataProvider()
    );
    setLastPaperError(null);
    return data;
  } catch (error) {
    setLastPaperError(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function updatePaperPositionRR(
  positionId: string,
  newRR: number
): Promise<PaperDashboardData> {
  try {
    const service = await paperService();
    const data = await service.updatePositionRR(
      positionId,
      newRR,
      runtimeMarketDataProvider(),
      Date.now()
    );
    setLastPaperError(null);
    return data;
  } catch (error) {
    setLastPaperError(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function resetPaperAccount(
  initialBalance?: number
): Promise<PaperDashboardData> {
  try {
    const service = await paperService();
    const data = await service.reset(Date.now(), initialBalance);
    setLastPaperError(null);
    return data;
  } catch (error) {
    setLastPaperError(error instanceof Error ? error.message : String(error));
    return readPaperDashboard();
  }
}


export async function readPaperState(): Promise<PaperStoreState> {
  const service = await paperService();
  return service.getStateSnapshot();
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
