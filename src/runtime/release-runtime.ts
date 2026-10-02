import {
  DEFAULT_ACCOUNT,
  DEFAULT_FRESHNESS_THRESHOLDS,
  DEFAULT_SCANNER_CONFIG,
  DEFAULT_SIGNAL_TTL,
  DEFAULT_TIMEFRAME_ROLES,
} from "@/config/scanner";
import { defaultEngineConfig } from "@/core/config/engine-config";
import { DEFAULT_STRATEGY_CONFIG } from "@/core/strategies/config";
import { STRATEGY_SYSTEM_POLICY } from "@/core/strategies/system-policy";
import {
  findActiveStrategyVersion,
  verifyStrategyVersionManifest,
} from "@/replay/strategy-version-registry";
import type { StrategyVersionRegistry } from "@/replay/strategy-version-types";
import type {
  ReleaseRuntimeResolution,
  ReleaseRuntimeState,
} from "@/runtime/release-runtime-types";

export function resolveReleaseRuntimeFromRegistry(
  registry: StrategyVersionRegistry,
  resolvedAt = Date.now()
): ReleaseRuntimeResolution {
  if (registry.entries.length === 0) {
    return {
      state: {
        status: "UNVERSIONED",
        reason: "REGISTRY_EMPTY",
        canScan: true,
        version: null,
        title: null,
        manifestFingerprint: null,
        sourceReportId: null,
        activationAt: null,
        registryUpdatedAt: registry.updatedAt,
        resolvedAt,
        pinned: false,
        defaultDrift: false,
        driftAreas: [],
        message:
          "No strategy version is registered yet; runtime is using the current built-in defaults.",
      },
      scannerOverrides: null,
    };
  }

  const activeVersion = findActiveStrategyVersion(registry);
  if (activeVersion === null) {
    return blockedState(
      "NO_ACTIVE_RELEASE",
      "The strategy registry has history but no ACTIVE version. Scanner execution is blocked until an ACTIVE release exists.",
      registry.updatedAt,
      resolvedAt
    );
  }

  const active = registry.entries.find(
    (entry) => entry.manifest.version === activeVersion
  );
  if (!active || !verifyStrategyVersionManifest(active.manifest)) {
    return blockedState(
      "MANIFEST_INVALID",
      "The ACTIVE strategy manifest failed integrity verification. Scanner execution is blocked.",
      registry.updatedAt,
      resolvedAt
    );
  }

  const manifest = active.manifest;
  const activationAt =
    [...active.statusHistory]
      .reverse()
      .find((event) => event.status === "ACTIVE")?.changedAt ??
    manifest.registeredAt;
  const driftAreas = detectDefaultDrift(manifest);
  const state: ReleaseRuntimeState = {
    status: "ACTIVE",
    reason: "ACTIVE_RELEASE",
    canScan: true,
    version: manifest.version,
    title: manifest.title,
    manifestFingerprint: manifest.manifestFingerprint,
    sourceReportId: manifest.sourceReportId,
    activationAt,
    registryUpdatedAt: registry.updatedAt,
    resolvedAt,
    pinned: true,
    defaultDrift: driftAreas.length > 0,
    driftAreas,
    message:
      driftAreas.length > 0
        ? "ACTIVE release is pinned from its immutable manifest; current code defaults differ in: " +
          driftAreas.join(", ") +
          "."
        : "ACTIVE release is pinned from its immutable validated strategy manifest.",
  };

  return {
    state,
    scannerOverrides: {
      symbols: [...manifest.symbols],
      timeframeRoles: structuredClone(
        manifest.strategySnapshot.scanner.timeframeRoles
      ),
      signalTtl: structuredClone(
        manifest.strategySnapshot.scanner.signalTtl
      ),
      freshness: structuredClone(
        manifest.strategySnapshot.scanner.freshness
      ),
      candleLookback: manifest.strategySnapshot.scanner.candleLookback,
      account: {
        riskPercent:
          manifest.validationSummary.assumptions.riskPercent,
      },
      engineConfig: structuredClone(
        manifest.strategySnapshot.engineConfig
      ),
      strategyConfig: structuredClone(
        manifest.strategySnapshot.strategyConfig ??
          DEFAULT_STRATEGY_CONFIG
      ),
    },
  };
}

export function blockedReleaseRuntime(
  reason: "REGISTRY_INVALID" | "MANIFEST_INVALID" | "NO_ACTIVE_RELEASE",
  message: string,
  resolvedAt = Date.now()
): ReleaseRuntimeResolution {
  return blockedState(reason, message, null, resolvedAt);
}

function blockedState(
  reason: "REGISTRY_INVALID" | "MANIFEST_INVALID" | "NO_ACTIVE_RELEASE",
  message: string,
  registryUpdatedAt: number | null,
  resolvedAt: number
): ReleaseRuntimeResolution {
  return {
    state: {
      status: "BLOCKED",
      reason,
      canScan: false,
      version: null,
      title: null,
      manifestFingerprint: null,
      sourceReportId: null,
      activationAt: null,
      registryUpdatedAt,
      resolvedAt,
      pinned: false,
      defaultDrift: false,
      driftAreas: [],
      message,
    },
    scannerOverrides: null,
  };
}

function detectDefaultDrift(
  manifest: StrategyVersionRegistry["entries"][number]["manifest"]
): string[] {
  const drift: string[] = [];
  if (
    stableStringify(manifest.strategySnapshot.engineConfig) !==
    stableStringify(defaultEngineConfig)
  ) {
    drift.push("engineConfig");
  }
  if (manifest.strategySnapshot.strategyConfig === undefined) {
    drift.push("strategyConfigLegacyUnpinned");
  } else if (
    stableStringify(manifest.strategySnapshot.strategyConfig) !==
    stableStringify(DEFAULT_STRATEGY_CONFIG)
  ) {
    drift.push("strategyConfig");
  }
  if (manifest.strategySnapshot.strategySystem === undefined) {
    drift.push("strategySystemLegacyUnpinned");
  } else if (
    stableStringify(manifest.strategySnapshot.strategySystem) !==
    stableStringify(STRATEGY_SYSTEM_POLICY)
  ) {
    drift.push("strategySystem");
  }
  if (
    stableStringify(manifest.strategySnapshot.scanner.timeframeRoles) !==
    stableStringify(DEFAULT_TIMEFRAME_ROLES)
  ) {
    drift.push("timeframeRoles");
  }
  if (
    stableStringify(manifest.strategySnapshot.scanner.signalTtl) !==
    stableStringify(DEFAULT_SIGNAL_TTL)
  ) {
    drift.push("signalTtl");
  }
  if (
    stableStringify(manifest.strategySnapshot.scanner.freshness) !==
    stableStringify(DEFAULT_FRESHNESS_THRESHOLDS)
  ) {
    drift.push("freshness");
  }
  if (
    manifest.strategySnapshot.scanner.candleLookback !==
    DEFAULT_SCANNER_CONFIG.candleLookback
  ) {
    drift.push("candleLookback");
  }
  if (
    manifest.validationSummary.assumptions.riskPercent !==
    DEFAULT_ACCOUNT.riskPercent
  ) {
    drift.push("riskPercent");
  }
  return drift;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(input)
        .sort()
        .map((key) => [key, stableValue(input[key])])
    );
  }
  return value;
}
