/**
 * Server-side scanner access.
 *
 * Phase 6 resolves the immutable ACTIVE strategy release before constructing
 * the scanner. Operational provider selection remains server-owned while
 * strategy/scanner thresholds come from the validated release manifest.
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
import { PRODUCTION_CONFIG } from "@/config/production";
import {
  releaseRuntimeIdentity,
  resolveRuntimeRelease,
} from "@/server/release-runtime-access";
import type { ReleaseRuntimeResolution } from "@/runtime/release-runtime-types";
import type { DeepPartial } from "@/core/config/engine-config";
import type { ScannerConfig } from "@/config/scanner";
import {
  assertForwardValidationPersistenceHealthy,
  recordForwardValidationObservation,
} from "@/server/forward-validation-access";
import { ensureStartupRecovery } from "@/server/startup-recovery";
import {
  acquireScannerLease,
  emitRuntimeTelemetry,
  releaseScannerLease,
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";
import { TRANSACTIONAL_CONFIG } from "@/config/transactional";

export const DEFAULT_SCAN_ASOF = runtimeDefaultAsOf();
const RECENT_TRANSITIONS = 12;

type ScannerRuntimeGlobal = typeof globalThis & {
  __fseScannerApi?: ScannerApi;
  __fseScannerReleaseIdentity?: string;
  __fseScanInFlight?: Promise<string | null>;
  __fseScanInFlightIdentity?: string;
  __fseScanStartedAt?: number;
  __fseAutoScanTimer?: ReturnType<typeof setInterval>;
  __fseNextAutoScanAt?: number;
};

async function scannerForRelease(
  release: ReleaseRuntimeResolution
): Promise<ScannerApi | null> {
  if (!release.state.canScan || PRODUCTION_CONFIG.maintenanceMode) return null;

  const runtime = globalThis as ScannerRuntimeGlobal;
  const identity = releaseRuntimeIdentity(release);
  if (
    runtime.__fseScannerApi &&
    runtime.__fseScannerReleaseIdentity === identity
  ) {
    return runtime.__fseScannerApi;
  }

  // Do not swap scanner state in the middle of an existing analysis cycle.
  if (runtime.__fseScanInFlight) {
    await runtime.__fseScanInFlight;
  }

  const runtimeSymbols =
    release.state.status === "ACTIVE" ? null : resolveRuntimeSymbols();
  const releaseOverrides =
    release.scannerOverrides ?? ({} as DeepPartial<ScannerConfig>);
  const overrides: DeepPartial<ScannerConfig> = {
    ...releaseOverrides,
    providerId: runtimeProviderId(),
    executionMode: "PAPER",
    ...(runtimeSymbols ? { symbols: runtimeSymbols } : {}),
  };

  runtime.__fseScannerApi = new ScannerApi(overrides, {
    marketData: runtimeMarketDataProvider(),
    conversionResolver: runtimeConversionResolver(),
  });
  runtime.__fseScannerReleaseIdentity = identity;
  return runtime.__fseScannerApi;
}

async function dashboardView(
  inst: ScannerApi | null,
  scanError: string | null,
  release: ReleaseRuntimeResolution
): Promise<DashboardData> {
  const allSignals = inst?.getAllSignals() ?? [];
  const signalHistory: DashboardData["signalHistory"] = {};

  if (inst) {
    for (const signal of allSignals) {
      signalHistory[signal.signalId] = inst.getSignalHistory(signal.signalId);
    }
  }

  return {
    snapshot: inst?.getLatestSnapshot() ?? null,
    health: inst?.getHealth() ?? null,
    activeSignals: allSignals.filter(
      (signal) => !isTerminalState(signal.state)
    ),
    allSignals,
    recentTransitions: inst?.getRecentTransitions(RECENT_TRANSITIONS) ?? [],
    signalHistory,
    scanError,
    providerId: runtimeProviderId(),
    liveMarketData: runtimeUsesLiveMarketData(),
    paper: await readPaperDashboard(),
    releaseRuntime: release.state,
    automation: {
      enabled:
        DEFAULT_PAPER_TRADING_CONFIG.autoScanEnabled &&
        release.state.canScan &&
        !PRODUCTION_CONFIG.maintenanceMode,
      scanIntervalMs: DEFAULT_PAPER_TRADING_CONFIG.autoScanIntervalMs,
      dashboardSyncIntervalMs:
        DEFAULT_PAPER_TRADING_CONFIG.dashboardSyncIntervalMs,
      nextScanAt:
        release.state.canScan
          ? (globalThis as ScannerRuntimeGlobal).__fseNextAutoScanAt ?? null
          : null,
    },
  };
}

async function runScanner(
  inst: ScannerApi,
  asOf: number,
  release: ReleaseRuntimeResolution
): Promise<string | null> {
  const runtime = globalThis as ScannerRuntimeGlobal;
  const expectedIdentity = releaseRuntimeIdentity(release);

  if (runtime.__fseScanInFlight) {
    if (runtime.__fseScanInFlightIdentity === expectedIdentity) {
      return runtime.__fseScanInFlight;
    }
    await runtime.__fseScanInFlight;
  }

  const lease = sharedTransactionalMode()
    ? await acquireScannerLease()
    : null;
  if (sharedTransactionalMode() && !lease) {
    return "Another runtime instance currently owns the distributed scanner lease.";
  }

  const startedAt = Date.now();
  const work = (async (): Promise<string | null> => {
    try {
      inst.setRuntimeAccountBalance(await paperBalance());
      await primeRuntimeConversionRates(asOf, inst.config.account.currency);
      const snapshot = await inst.runScan(asOf);

      // Re-resolve governance before creating Paper orders. A registry change
      // during analysis invalidates this scan for execution purposes.
      const currentRelease = await resolveRuntimeRelease();
      if (
        !currentRelease.state.canScan ||
        releaseRuntimeIdentity(currentRelease) !== expectedIdentity
      ) {
        return "Strategy release changed during scan; Paper execution was not applied. Refresh to run under the current release.";
      }

      // A long analysis cycle must prove it still owns the shared lease before
      // mutating Paper or forward evidence. The fencing token prevents an
      // expired owner from releasing or completing work owned by a successor.
      if (lease) {
        const renewed = await transactionalStore().renewLease(
          lease,
          TRANSACTIONAL_CONFIG.leaseTtlMs
        );
        if (!renewed) {
          return "Distributed scanner lease expired during analysis; Paper execution was not applied.";
        }
      }

      await assertForwardValidationPersistenceHealthy();
      const paper = await processPaperSnapshot(
        snapshot,
        currentRelease.state
      );
      await recordForwardValidationObservation(
        snapshot,
        paper,
        currentRelease.state
      );
      await emitRuntimeTelemetry({
        category: "scanner",
        name: "cycle",
        level: "INFO",
        durationMs: Date.now() - startedAt,
        attributes: {
          release: currentRelease.state.version ?? "unversioned",
          symbolsRequested: snapshot.symbolsRequested,
          symbolsSuccessful: snapshot.symbolsSuccessful,
          symbolsFailed: snapshot.symbolsFailed,
        },
      });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await emitRuntimeTelemetry({
        category: "scanner",
        name: "cycle",
        level: "ERROR",
        durationMs: Date.now() - startedAt,
        attributes: {
          error: message.slice(0, 500),
          release: release.state.version ?? "unversioned",
        },
      });
      return message;
    }
  })();

  runtime.__fseScanInFlight = work;
  runtime.__fseScanInFlightIdentity = expectedIdentity;
  runtime.__fseScanStartedAt = startedAt;

  try {
    return await work;
  } finally {
    await releaseScannerLease(lease);
    if (runtime.__fseScanInFlight === work) {
      runtime.__fseScanInFlight = undefined;
      runtime.__fseScanInFlightIdentity = undefined;
      runtime.__fseScanStartedAt = undefined;
    }
  }
}

function ensureAutoScanner(): void {
  if (
    !DEFAULT_PAPER_TRADING_CONFIG.autoScanEnabled ||
    PRODUCTION_CONFIG.maintenanceMode
  ) {
    return;
  }

  const runtime = globalThis as ScannerRuntimeGlobal;
  if (runtime.__fseAutoScanTimer) return;

  const interval = Math.max(
    5_000,
    DEFAULT_PAPER_TRADING_CONFIG.autoScanIntervalMs
  );

  runtime.__fseNextAutoScanAt = Date.now() + interval;

  const timer = setInterval(() => {
    runtime.__fseNextAutoScanAt = Date.now() + interval;
    void (async () => {
      const startup = await ensureStartupRecovery();
      if (startup.blocking) return;
      const release = await resolveRuntimeRelease();
      const inst = await scannerForRelease(release);
      if (!inst) return;
      await runScanner(inst, runtimeDefaultAsOf(), release);
    })();
  }, interval);

  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }

  runtime.__fseAutoScanTimer = timer;
}

export async function readDashboard(
  asOf: number = runtimeDefaultAsOf()
): Promise<DashboardData> {
  ensureAutoScanner();
  const startup = await ensureStartupRecovery();
  const release = await resolveRuntimeRelease();
  if (startup.blocking) {
    return dashboardView(
      null,
      "Startup recovery blocked scanner execution: " +
        startup.checks
          .filter((item) => item.critical && !item.ok)
          .map((item) => item.domain + ": " + item.message)
          .join("; "),
      release
    );
  }
  const inst = await scannerForRelease(release);

  if (!inst) {
    return dashboardView(
      inst,
      PRODUCTION_CONFIG.maintenanceMode
        ? "Maintenance mode is enabled; scanner execution is blocked."
        : release.state.message,
      release
    );
  }

  let scanError: string | null = null;
  if (!inst.getLatestSnapshot()) {
    scanError = await runScanner(inst, asOf, release);
  }

  const currentRelease = await resolveRuntimeRelease();
  const currentInst = await scannerForRelease(currentRelease);
  return dashboardView(currentInst, scanError, currentRelease);
}

export async function refreshScanner(
  asOf: number = runtimeDefaultAsOf()
): Promise<DashboardData> {
  ensureAutoScanner();
  const startup = await ensureStartupRecovery();
  const release = await resolveRuntimeRelease();
  if (startup.blocking) {
    return dashboardView(
      null,
      "Startup recovery blocked scanner execution: " +
        startup.checks
          .filter((item) => item.critical && !item.ok)
          .map((item) => item.domain + ": " + item.message)
          .join("; "),
      release
    );
  }
  const inst = await scannerForRelease(release);

  if (!inst) {
    return dashboardView(
      inst,
      PRODUCTION_CONFIG.maintenanceMode
        ? "Maintenance mode is enabled; scanner execution is blocked."
        : release.state.message,
      release
    );
  }

  const scanError = await runScanner(inst, asOf, release);
  const currentRelease = await resolveRuntimeRelease();
  const currentInst = await scannerForRelease(currentRelease);
  return dashboardView(currentInst, scanError, currentRelease);
}

export async function listUniverse(): Promise<string[]> {
  const startup = await ensureStartupRecovery();
  if (startup.blocking) return [];
  const release = await resolveRuntimeRelease();
  const inst = await scannerForRelease(release);
  return inst?.listSymbols() ?? [];
}


export function scannerRuntimeStatus(): {
  scanInFlight: boolean;
  scanStartedAt: number | null;
  scanAgeMs: number | null;
  nextAutoScanAt: number | null;
  maintenanceMode: boolean;
} {
  const runtime = globalThis as ScannerRuntimeGlobal;
  const startedAt = runtime.__fseScanStartedAt ?? null;
  return {
    scanInFlight: Boolean(runtime.__fseScanInFlight),
    scanStartedAt: startedAt,
    scanAgeMs:
      startedAt === null ? null : Math.max(0, Date.now() - startedAt),
    nextAutoScanAt: runtime.__fseNextAutoScanAt ?? null,
    maintenanceMode: PRODUCTION_CONFIG.maintenanceMode,
  };
}
