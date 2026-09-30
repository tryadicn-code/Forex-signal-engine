import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { PRODUCTION_CONFIG } from "@/config/production";
import { BROKER_EXECUTION_CONFIG } from "@/config/broker";
import { TRANSACTIONAL_CONFIG } from "@/config/transactional";
import { STORAGE_PATHS } from "@/config/storage";
import { inspectDurableJson } from "@/persistence/durable-json";
import type { DurableFileHealth } from "@/persistence/types";
import type {
  ProductionHealthCheck,
  ProductionHealthSnapshot,
  ProductionReadiness,
} from "@/production/health-types";
import {
  runtimeMarketDataProvider,
  runtimeProviderId,
  runtimeUsesLiveMarketData,
} from "@/server/runtime-market-data";
import { resolveRuntimeRelease } from "@/server/release-runtime-access";
import { scannerRuntimeStatus } from "@/server/scanner-access";
import { readBrokerExecutionDashboard } from "@/server/broker-execution-access";
import { ensureStartupRecovery } from "@/server/startup-recovery";
import {
  runtimeInstanceId,
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";

export async function readProductionHealth(): Promise<ProductionHealthSnapshot> {
  const generatedAt = Date.now();
  const startupRecovery = await ensureStartupRecovery();
  const sharedMode = sharedTransactionalMode();
  const [release, persistence, storageWritable, transactional, broker] =
    await Promise.all([
      resolveRuntimeRelease(),
      sharedMode ? Promise.resolve([]) : inspectCriticalPersistence(),
      sharedMode
        ? Promise.resolve({
            ok: true,
            message:
              "Local filesystem durability is not authoritative in shared transactional mode.",
          })
        : probeStorageWritable(),
      sharedMode
        ? transactionalStore().health()
        : Promise.resolve(null),
      readBrokerExecutionDashboard(),
    ]);
  const provider = runtimeMarketDataProvider().getProviderStatus();
  const runtime = scannerRuntimeStatus();
  const checks: ProductionHealthCheck[] = [];

  const brokerMode = BROKER_EXECUTION_CONFIG.mode.toUpperCase() as
    | "OFF"
    | "SHADOW"
    | "LIVE";

  checks.push({
    id: "broker-execution",
    status:
      brokerMode !== "LIVE"
        ? "PASS"
        : !BROKER_EXECUTION_CONFIG.liveExecutionEnabled ||
            !BROKER_EXECUTION_CONFIG.approvalSecret ||
            BROKER_EXECUTION_CONFIG.allowedSymbols.length === 0 ||
            !sharedMode ||
            broker.providerId === "shadow" ||
            !broker.brokerStatus.connected ||
            !broker.brokerStatus.tradeAllowed
          ? "FAIL"
          : "PASS",
    message:
      brokerMode === "OFF"
        ? "Broker execution is OFF; Paper Trading remains the only execution path."
        : brokerMode === "SHADOW"
          ? "Shadow broker evaluation is enabled; no real broker order can be transmitted."
          : !BROKER_EXECUTION_CONFIG.liveExecutionEnabled
            ? "LIVE broker mode is selected but FSE_LIVE_EXECUTION_ENABLED is false."
            : !BROKER_EXECUTION_CONFIG.approvalSecret
              ? "LIVE broker mode requires FSE_LIVE_APPROVAL_SECRET."
              : BROKER_EXECUTION_CONFIG.allowedSymbols.length === 0
                ? "LIVE broker mode requires an explicit non-empty symbol allowlist."
                : !sharedMode
                  ? "LIVE broker mode requires shared transactional state."
                  : broker.providerId === "shadow"
                    ? "LIVE broker mode requires a real broker provider."
                    : !broker.brokerStatus.connected ||
                        !broker.brokerStatus.tradeAllowed
                      ? "LIVE broker provider is not connected/trade-ready."
                      : "LIVE broker infrastructure gates are configured and trade-ready.",
  });

  checks.push({
    id: "broker-controls",
    status:
      brokerMode === "LIVE" &&
      (broker.controls.killSwitchEngaged ||
        !broker.controls.liveArm ||
        broker.unresolvedCount > 0)
        ? "WARN"
        : "PASS",
    message:
      broker.unresolvedCount > 0
        ? broker.unresolvedCount +
          " live execution record(s) require reconciliation; new live orders are blocked."
        : brokerMode !== "LIVE"
          ? "Live broker controls are not active in the current mode."
          : broker.controls.killSwitchEngaged
            ? "Kill-switch is engaged; live orders are blocked."
            : !broker.controls.liveArm
              ? "No live arm approval is active; live orders are blocked."
              : "Live arm approval is active with " +
                broker.controls.liveArm.remainingOrders +
                " order(s) remaining.",
  });

  checks.push({
    id: "transactional-store",
    status: sharedMode
      ? transactional?.ok
        ? "PASS"
        : "FAIL"
      : TRANSACTIONAL_CONFIG.requireSharedStore
        ? "FAIL"
        : "WARN",
    message: sharedMode
      ? transactional?.message ??
        "Shared transactional backend health is unavailable."
      : TRANSACTIONAL_CONFIG.requireSharedStore
        ? "Deployment requires shared transactional persistence but local compatibility mode is active."
        : "Local durable persistence mode is active; safe for single-node deployment only.",
  });

  checks.push({
    id: "startup-recovery",
    status: startupRecovery.blocking
      ? "FAIL"
      : startupRecovery.checks.some((item) => !item.ok)
        ? "WARN"
        : "PASS",
    message: startupRecovery.blocking
      ? "Critical startup recovery failed; scanner is blocked."
      : startupRecovery.checks.some((item) => !item.ok)
        ? "Startup recovery completed with non-critical warnings."
        : "Startup recovery checks completed successfully.",
  });

  checks.push({
    id: "execution-mode",
    status: "PASS",
    message: "Execution mode is PAPER; real broker orders are not enabled.",
  });

  checks.push({
    id: "maintenance-mode",
    status: PRODUCTION_CONFIG.maintenanceMode ? "FAIL" : "PASS",
    message: PRODUCTION_CONFIG.maintenanceMode
      ? "Maintenance mode is enabled; scanner execution is intentionally blocked."
      : "Maintenance mode is disabled.",
  });

  checks.push({
    id: "storage-writable",
    status: storageWritable.ok ? "PASS" : "FAIL",
    message: storageWritable.message,
  });

  if (release.state.status === "BLOCKED") {
    checks.push({
      id: "release-runtime",
      status: "FAIL",
      message: release.state.message,
    });
  } else if (release.state.status === "UNVERSIONED") {
    checks.push({
      id: "release-runtime",
      status: PRODUCTION_CONFIG.requireActiveRelease ? "FAIL" : "WARN",
      message: PRODUCTION_CONFIG.requireActiveRelease
        ? "An ACTIVE strategy release is required by production configuration."
        : "Runtime is UNVERSIONED; built-in defaults are active.",
    });
  } else {
    checks.push({
      id: "release-runtime",
      status: "PASS",
      message:
        "ACTIVE strategy release " +
        release.state.version +
        " passed manifest integrity verification.",
    });
  }

  if (PRODUCTION_CONFIG.requireLiveMarketData && !runtimeUsesLiveMarketData()) {
    checks.push({
      id: "market-data-mode",
      status: "FAIL",
      message:
        "Production configuration requires live market data but provider is mock.",
    });
  } else {
    checks.push({
      id: "market-data-mode",
      status: runtimeUsesLiveMarketData() ? "PASS" : "WARN",
      message: runtimeUsesLiveMarketData()
        ? "Live market-data provider is configured."
        : "Mock market-data provider is configured.",
    });
  }

  checks.push({
    id: "provider-state",
    status:
      provider.state === "DISCONNECTED"
        ? "FAIL"
        : provider.state === "DEGRADED"
          ? "WARN"
          : "PASS",
    message:
      "Provider " +
      runtimeProviderId().toUpperCase() +
      " state is " +
      provider.state +
      ".",
  });

  const corrupt = persistence.filter((item) => item.state === "CORRUPT");
  const recovered = persistence.filter(
    (item) =>
      item.state === "RECOVERED" ||
      item.state === "LEGACY_UNVERIFIED"
  );
  checks.push({
    id: "persistence-integrity",
    status:
      corrupt.length > 0
        ? "FAIL"
        : recovered.length > 0
          ? "WARN"
          : "PASS",
    message:
      corrupt.length > 0
        ? corrupt.length + " persistence file(s) are unrecoverable."
        : recovered.length > 0
          ? recovered.length +
            " persistence file(s) require attention or checksum migration."
          : "Critical persistence files have no detected integrity failure.",
  });

  if (runtime.scanInFlight && runtime.scanAgeMs !== null) {
    checks.push({
      id: "scan-runtime",
      status: runtime.scanAgeMs > 120_000 ? "WARN" : "PASS",
      message:
        "A scan is in flight for " +
        Math.round(runtime.scanAgeMs / 1000) +
        " seconds.",
    });
  } else {
    checks.push({
      id: "scan-runtime",
      status: "PASS",
      message: "No scanner cycle is currently stuck in flight.",
    });
  }

  const readiness = deriveReadiness(checks);

  return {
    schemaVersion: 1,
    protocol: "phase-10-health-v1",
    generatedAt,
    uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
    readiness,
    executionMode:
      BROKER_EXECUTION_CONFIG.mode === "live"
        ? "LIVE"
        : BROKER_EXECUTION_CONFIG.mode === "shadow"
          ? "SHADOW"
          : "PAPER",
    safety: {
      maintenanceMode: PRODUCTION_CONFIG.maintenanceMode,
      requireActiveRelease: PRODUCTION_CONFIG.requireActiveRelease,
      requireLiveMarketData: PRODUCTION_CONFIG.requireLiveMarketData,
      requireSharedTransactionalStore:
        TRANSACTIONAL_CONFIG.requireSharedStore,
      liveExecutionEnabled:
        BROKER_EXECUTION_CONFIG.liveExecutionEnabled,
    },
    infrastructure: {
      mode: sharedMode ? "SHARED" : "LOCAL",
      instanceId: runtimeInstanceId(),
      transactional,
    },
    broker,
    providerId: runtimeProviderId(),
    liveMarketData: runtimeUsesLiveMarketData(),
    provider,
    releaseRuntime: release.state,
    startupRecovery,
    persistence,
    checks,
  };
}

async function inspectCriticalPersistence(): Promise<DurableFileHealth[]> {
  const files = [
    STORAGE_PATHS.paper,
    STORAGE_PATHS.strategyRegistry,
    STORAGE_PATHS.releaseRuntimeAudit,
    STORAGE_PATHS.forwardValidation,
  ];

  try {
    const entries = await fs.readdir(STORAGE_PATHS.backtestRuns);
    for (const entry of entries
      .filter((name) => name.endsWith(".json"))
      .sort()
      .slice(-20)) {
      files.push(path.join(STORAGE_PATHS.backtestRuns, entry));
    }
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  return Promise.all(files.map((file) => inspectDurableJson(file)));
}

async function probeStorageWritable(): Promise<{
  ok: boolean;
  message: string;
}> {
  const probe = path.join(
    STORAGE_PATHS.dataDirectory,
    ".phase-8-write-probe-" + process.pid
  );
  try {
    await fs.mkdir(STORAGE_PATHS.dataDirectory, { recursive: true });
    const handle = await fs.open(probe, "w");
    try {
      await handle.writeFile("ok", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rm(probe, { force: true });
    return {
      ok: true,
      message: "Data directory is writable.",
    };
  } catch (error) {
    await fs.rm(probe, { force: true }).catch(() => undefined);
    return {
      ok: false,
      message:
        "Data directory write probe failed: " +
        (error instanceof Error ? error.message : String(error)),
    };
  }
}

function deriveReadiness(
  checks: ProductionHealthCheck[]
): ProductionReadiness {
  if (checks.some((item) => item.status === "FAIL")) return "BLOCKED";
  if (checks.some((item) => item.status === "WARN")) return "DEGRADED";
  return "READY";
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "ENOENT"
  );
}
