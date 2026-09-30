import "server-only";

import { DEFAULT_FORWARD_VALIDATION_CONFIG } from "@/config/forward-validation";
import { STORAGE_PATHS } from "@/config/storage";
import { buildForwardValidationReport } from "@/forward-validation/analyzer";
import { JsonFileForwardValidationStore } from "@/forward-validation/store";
import type {
  ForwardValidationObservation,
  ForwardValidationSnapshot,
} from "@/forward-validation/types";
import type { PaperDashboardData } from "@/paper/types";
import { findActiveStrategyVersion } from "@/replay/strategy-version-registry";
import type { ScannerSnapshot } from "@/scanner/scanner-result";
import { readPaperState } from "@/server/paper-trading-access";
import { resolveRuntimeRelease } from "@/server/release-runtime-access";
import { readStrategyVersionRegistry } from "@/server/strategy-version-access";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";

const store = new JsonFileForwardValidationStore(
  STORAGE_PATHS.forwardValidation,
  DEFAULT_FORWARD_VALIDATION_CONFIG.maxObservations
);

export async function recordForwardValidationObservation(
  snapshot: ScannerSnapshot,
  paper: PaperDashboardData,
  release: ReleaseRuntimeState
): Promise<void> {
  if (
    release.status !== "ACTIVE" ||
    !release.version ||
    !release.manifestFingerprint ||
    !release.sourceReportId ||
    release.activationAt === null
  ) {
    return;
  }

  const observedAt = snapshot.completedAt ?? snapshot.startedAt;
  const matchingOrders = paper.recentOrders.filter(
    (order) =>
      order.requestedAt === observedAt &&
      order.engine.strategyVersion === release.version &&
      order.engine.strategyManifestFingerprint ===
        release.manifestFingerprint &&
      order.engine.strategyActivationAt === release.activationAt
  );

  const observation: ForwardValidationObservation = {
    id: [
      release.version,
      release.manifestFingerprint,
      release.activationAt,
      observedAt,
    ].join(":"),
    observedAt,
    strategyVersion: release.version,
    manifestFingerprint: release.manifestFingerprint,
    activationAt: release.activationAt,
    sourceReportId: release.sourceReportId,
    providerState: snapshot.providerStatus?.state ?? null,
    symbolsRequested: snapshot.symbolsRequested,
    symbolsSuccessful: snapshot.symbolsSuccessful,
    symbolsFailed: snapshot.symbolsFailed,
    freshness: {
      fresh: snapshot.freshnessSummary.FRESH,
      delayed: snapshot.freshnessSummary.DELAYED,
      stale: snapshot.freshnessSummary.STALE,
    },
    engineExecuteCount: snapshot.results.filter(
      (result) => result.executionDecision === "EXECUTE"
    ).length,
    lifecycleExecuteCount: snapshot.results.filter(
      (result) =>
        result.executionDecision === "EXECUTE" &&
        result.signalState === "EXECUTE"
    ).length,
    paperFilledCount: matchingOrders.filter(
      (order) => order.status === "FILLED"
    ).length,
    paperRejectedCount: matchingOrders.filter(
      (order) => order.status === "REJECTED"
    ).length,
  };

  await store.append(observation);
}

export async function assertForwardValidationPersistenceHealthy(): Promise<void> {
  await store.read();
}

export async function readForwardValidationStoreState() {
  return store.read();
}

export async function readForwardValidationSnapshot(): Promise<ForwardValidationSnapshot> {
  const generatedAt = Date.now();
  const release = await resolveRuntimeRelease();
  if (
    release.state.status !== "ACTIVE" ||
    !release.state.version ||
    !release.state.manifestFingerprint ||
    release.state.activationAt === null
  ) {
    return {
      schemaVersion: 1,
      protocol: "phase-7-forward-v1",
      generatedAt,
      status: "NO_ACTIVE_RELEASE",
      message:
        "Forward validation requires one verified ACTIVE strategy release.",
    };
  }

  const registry = await readStrategyVersionRegistry();
  const activeVersion = findActiveStrategyVersion(registry);
  const entry = registry.entries.find(
    (item) =>
      item.currentStatus === "ACTIVE" &&
      item.manifest.version === activeVersion &&
      item.manifest.version === release.state.version &&
      item.manifest.manifestFingerprint ===
        release.state.manifestFingerprint
  );
  if (!entry) {
    throw new Error(
      "ACTIVE runtime release could not be matched to its immutable registry manifest."
    );
  }

  const [paper, stored] = await Promise.all([
    readPaperState(),
    store.read(),
  ]);

  return buildForwardValidationReport({
    manifest: entry.manifest,
    activationAt: release.state.activationAt,
    paper,
    observations: stored.observations,
    generatedAt,
  });
}
