/**
 * Server-side scanner access.
 *
 * Phase 6 resolves the immutable ACTIVE strategy release before constructing
 * the scanner. Operational provider selection remains server-owned while
 * strategy/scanner thresholds come from the validated release manifest.
 */

import "server-only";

import { ScannerApi } from "@/scanner/scanner-api";
import type { ScannerSnapshot } from "@/scanner/scanner-result";
import { isTerminalState } from "@/lib/signal-meta";
import type { DashboardData, DownstreamStatus } from "@/types/dashboard";
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
import type { PaperDashboardData } from "@/paper/types";
import { DEFAULT_SYMBOL_UNIVERSE, type ScannerConfig } from "@/config/scanner";
import { readScannerUniverse } from "@/server/scanner-universe-access";
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
import { processBrokerSnapshot } from "@/server/broker-execution-access";
import {
  processNotificationSnapshot,
  readNotificationDashboard,
} from "@/server/notification-access";
import {
  readSignalFunnelDashboard,
  recordSignalFunnelObservations,
} from "@/server/signal-funnel-access";

export const DEFAULT_SCAN_ASOF = runtimeDefaultAsOf();
const RECENT_TRANSITIONS = 12;

type ScanOutcome = {
  scanError: string | null;
  downstream: DownstreamStatus;
};

function skippedDownstream(reason: string): DownstreamStatus {
  return {
    forwardValidation: { ok: "skipped", because: reason },
    paper: { ok: "skipped", because: reason },
    notification: { ok: "skipped", because: reason },
    broker: { ok: "skipped", because: reason },
  };
}

function okDownstream(): DownstreamStatus {
  return {
    forwardValidation: { ok: true },
    paper: { ok: true },
    notification: { ok: true },
    broker: { ok: true },
  };
}

function stageError(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}
type ScannerRuntimeGlobal = typeof globalThis & {
  __fseScannerApi?: ScannerApi;
  __fseScannerReleaseIdentity?: string;
  __fseScanInFlight?: Promise<ScanOutcome>;
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
  const releaseSymbols = Array.isArray(release.scannerOverrides?.symbols)
    ? release.scannerOverrides.symbols.filter(
        (symbol): symbol is string => typeof symbol === "string"
      )
    : null;
  const stagedSymbols = resolveRuntimeSymbols();
  const universe = await readScannerUniverse(
    releaseSymbols?.length
      ? releaseSymbols
      : stagedSymbols ?? DEFAULT_SYMBOL_UNIVERSE
  );
  const identity =
    releaseRuntimeIdentity(release) + "|symbols:" + universe.selected.join(",");

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

  const releaseOverrides =
    release.scannerOverrides ?? ({} as DeepPartial<ScannerConfig>);
  const overrides: DeepPartial<ScannerConfig> = {
    ...releaseOverrides,
    providerId: runtimeProviderId(),
    executionMode: "PAPER",
    // Pair selection is an operational universe choice; strategy thresholds
    // and all other release-pinned settings remain untouched.
    symbols: universe.selected,
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
  release: ReleaseRuntimeResolution,
  downstreamStatus?: DownstreamStatus,
): Promise<DashboardData> {
  const allSignals = inst?.getAllSignals() ?? [];
  const signalHistory: DashboardData["signalHistory"] = {};
  const signalFunnel = await readSignalFunnelDashboard();

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
    downstreamStatus,
    providerId: runtimeProviderId(),
    liveMarketData: runtimeUsesLiveMarketData(),
    paper: await readPaperDashboard(),
    notifications: await readNotificationDashboard(),
    signalFunnel: signalFunnel.analytics,
    signalFunnelError: signalFunnel.persistenceError,
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
): Promise<ScanOutcome> {
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
    return {
      scanError:
        "Another runtime instance currently owns the distributed scanner lease.",
      downstream: skippedDownstream("scanner lease not held"),
    };
  }

  const startedAt = Date.now();
  const work = (async (): Promise<ScanOutcome> => {
    let analyticsPersistence: Promise<void> = Promise.resolve();

    try {
      let snapshot: ScannerSnapshot;
      let currentRelease: ReleaseRuntimeResolution;

      try {
        inst.setRuntimeAccountBalance(await paperBalance());
        await primeRuntimeConversionRates(
          asOf,
          inst.config.account.currency
        );
        snapshot = await inst.runScan(asOf);
        analyticsPersistence = persistSignalFunnelSafely(inst, snapshot);

        currentRelease = await resolveRuntimeRelease();
        if (
          !currentRelease.state.canScan ||
          releaseRuntimeIdentity(currentRelease) !== expectedIdentity
        ) {
          return {
            scanError:
              "Strategy release changed during scan; Paper execution was not applied. Refresh to run under the current release.",
            downstream: skippedDownstream(
              "strategy release changed during scan"
            ),
          };
        }

        if (
          currentRelease.state.status === "ACTIVE" &&
          !currentRelease.state.pinned
        ) {
          return {
            scanError:
              "ACTIVE release predates complete multi-strategy governance; Paper, forward-validation, alerts, and broker execution were not applied. Register a newly validated release first.",
            downstream: skippedDownstream("release not pinned"),
          };
        }

        if (lease) {
          const renewed = await transactionalStore().renewLease(
            lease,
            TRANSACTIONAL_CONFIG.leaseTtlMs
          );
          if (!renewed) {
            return {
              scanError:
                "Distributed scanner lease expired during analysis; Paper execution was not applied.",
              downstream: skippedDownstream("scanner lease expired"),
            };
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
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
        return {
          scanError: message,
          downstream: skippedDownstream("scan phase failed"),
        };
      }

      const downstream = okDownstream();

      try {
        await assertForwardValidationPersistenceHealthy();
      } catch (error) {
        downstream.forwardValidation = stageError(error);
        const reason = "forward-validation preflight failed";
        downstream.paper = { ok: "skipped", because: reason };
        downstream.notification = { ok: "skipped", because: reason };
        downstream.broker = { ok: "skipped", because: reason };
        await emitRuntimeTelemetry({
          category: "scanner",
          name: "forward-validation-preflight",
          level: "ERROR",
          durationMs: null,
          attributes: {
            error: (
              error instanceof Error ? error.message : String(error)
            ).slice(0, 500),
          },
        });
        return { scanError: null, downstream };
      }

      let paper: PaperDashboardData;
      try {
        paper = await processPaperSnapshot(
          snapshot,
          currentRelease.state
        );
      } catch (error) {
        downstream.paper = stageError(error);
        const reason = "paper processing failed";
        downstream.forwardValidation = { ok: "skipped", because: reason };
        downstream.notification = { ok: "skipped", because: reason };
        downstream.broker = { ok: "skipped", because: reason };
        await emitRuntimeTelemetry({
          category: "scanner",
          name: "paper-processing",
          level: "ERROR",
          durationMs: null,
          attributes: {
            error: (
              error instanceof Error ? error.message : String(error)
            ).slice(0, 500),
          },
        });
        return { scanError: null, downstream };
      }

      try {
        await recordForwardValidationObservation(
          snapshot,
          paper,
          currentRelease.state
        );
      } catch (error) {
        downstream.forwardValidation = stageError(error);
        const reason = "forward-validation observation failed";
        downstream.notification = { ok: "skipped", because: reason };
        downstream.broker = { ok: "skipped", because: reason };
        await emitRuntimeTelemetry({
          category: "scanner",
          name: "forward-validation-observation",
          level: "ERROR",
          durationMs: null,
          attributes: {
            error: (
              error instanceof Error ? error.message : String(error)
            ).slice(0, 500),
          },
        });
        return { scanError: null, downstream };
      }

      try {
        await processNotificationSnapshot(
          snapshot,
          currentRelease.state
        );
      } catch (notificationError) {
        downstream.notification = stageError(notificationError);
        await emitRuntimeTelemetry({
          category: "notifications",
          name: "scan-alert-failure",
          level: "WARN",
          durationMs: null,
          attributes: {
            error:
              notificationError instanceof Error
                ? notificationError.message.slice(0, 500)
                : String(notificationError).slice(0, 500),
          },
        });
      }

      try {
        await processBrokerSnapshot(snapshot, currentRelease.state);
      } catch (error) {
        downstream.broker = stageError(error);
        await emitRuntimeTelemetry({
          category: "broker",
          name: "scan-broker-processing",
          level: "ERROR",
          durationMs: null,
          attributes: {
            error: (
              error instanceof Error ? error.message : String(error)
            ).slice(0, 500),
          },
        });
      }

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

      return { scanError: null, downstream };
    } finally {
      await analyticsPersistence;
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
async function persistSignalFunnelSafely(
  inst: ScannerApi,
  snapshot: ScannerSnapshot
): Promise<void> {
  try {
    await recordSignalFunnelObservations(inst, snapshot);
  } catch (analyticsError) {
    await emitRuntimeTelemetry({
      category: "scanner",
      name: "signal-funnel-persistence-failure",
      level: "WARN",
      durationMs: null,
      attributes: {
        error:
          analyticsError instanceof Error
            ? analyticsError.message.slice(0, 500)
            : String(analyticsError).slice(0, 500),
      },
    });
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
  let downstreamStatus: DownstreamStatus | undefined;
  if (!inst.getLatestSnapshot()) {
    const outcome = await runScanner(inst, asOf, release);
    scanError = outcome.scanError;
    downstreamStatus = outcome.downstream;
  }

  const currentRelease = await resolveRuntimeRelease();
  const currentInst = await scannerForRelease(currentRelease);
  return dashboardView(currentInst, scanError, currentRelease, downstreamStatus);
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

  const outcome = await runScanner(inst, asOf, release);
  const scanError = outcome.scanError;
  const downstreamStatus = outcome.downstream;

  if (
    DEFAULT_PAPER_TRADING_CONFIG.autoScanEnabled &&
    !PRODUCTION_CONFIG.maintenanceMode
  ) {
    const interval = Math.max(
      5_000,
      DEFAULT_PAPER_TRADING_CONFIG.autoScanIntervalMs
    );
    (globalThis as ScannerRuntimeGlobal).__fseNextAutoScanAt =
      Date.now() + interval;
  }

  const currentRelease = await resolveRuntimeRelease();
  const currentInst = await scannerForRelease(currentRelease);
  return dashboardView(currentInst, scanError, currentRelease, downstreamStatus);
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
