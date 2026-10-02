import {
  defaultEngineConfig,
  type EngineConfig,
} from "@/core/config/engine-config";
import {
  DEFAULT_FRESHNESS_THRESHOLDS,
  DEFAULT_SCANNER_CONFIG,
  DEFAULT_SIGNAL_TTL,
  DEFAULT_TIMEFRAME_ROLES,
} from "@/config/scanner";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import { DEFAULT_STRATEGY_CONFIG } from "@/core/strategies/config";
import { STRATEGY_SYSTEM_POLICY } from "@/core/strategies/system-policy";
import {
  buildReleaseGateAuditRecord,
  isReleaseReviewCurrent,
} from "@/replay/release-gate";
import { buildValidationSummary } from "@/replay/statistical-diagnostics";
import { buildBacktestReproducibilityFingerprint } from "@/replay/robustness-validation";
import type {
  RegisterStrategyVersionInput,
  StrategyBaselineSnapshot,
  StrategyVersionManifest,
  StrategyVersionRegistry,
} from "@/replay/strategy-version-types";

export function normalizeStrategyVersion(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
  if (!match) {
    throw new Error(
      "Strategy version must use semantic version format, e.g. v1.0.0."
    );
  }
  return "v" + Number(match[1]) + "." + Number(match[2]) + "." + Number(match[3]);
}

export function assertArtifactEligibleForStrategyRegistration(
  artifact: BacktestRunArtifact
): void {
  const review = artifact.releaseReview;
  if (!review) {
    throw new Error("Strategy registration requires a saved Phase 5.8 release review.");
  }
  if (!isReleaseReviewCurrent(artifact)) {
    throw new Error("Strategy registration requires a current, non-stale release review.");
  }
  if (review.decision !== "PROMOTE") {
    throw new Error("Only a report with manual PROMOTE decision can register a strategy version.");
  }
}

export function buildStrategyVersionManifest(
  artifact: BacktestRunArtifact,
  input: RegisterStrategyVersionInput,
  registeredAt = Date.now()
): StrategyVersionManifest {
  assertArtifactEligibleForStrategyRegistration(artifact);

  const version = normalizeStrategyVersion(input.version);
  const registeredBy = normalizeActor(input.registeredBy, "registeredBy");
  const title = normalizeTitle(input.title ?? artifact.metadata?.label ?? version);
  const note = normalizeNote(input.note ?? "");
  const releaseReview = artifact.releaseReview!;
  const reproducibility = buildBacktestReproducibilityFingerprint(artifact);
  const strategySnapshot = buildStrategyBaselineSnapshot();

  const base = {
    schemaVersion: 1 as const,
    protocol: "phase-5.9-v1" as const,
    version,
    title,
    note,
    registeredAt,
    registeredBy,
    sourceReportId: artifact.id,
    sourceDatasetId: artifact.config.datasetId,
    symbols: [...artifact.validation.symbols].sort(),
    validationWindow: {
      startAt: artifact.config.startAt,
      endAt: artifact.config.endAt,
    },
    releaseReviewer: releaseReview.reviewer,
    releaseReviewedAt: releaseReview.updatedAt,
    reviewedFingerprint: releaseReview.reviewedFingerprint,
    reproducibility: {
      assumptions: reproducibility.assumptions,
      outcomes: reproducibility.outcomes,
      combined: reproducibility.combined,
    },
    strategySnapshot,
    validationSummary: buildValidationSummary(artifact),
    releaseGateAudit: buildReleaseGateAuditRecord(artifact),
  };

  return {
    ...base,
    manifestFingerprint: fingerprint(stableStringify(base)),
  };
}

export function verifyStrategyVersionManifest(
  manifest: StrategyVersionManifest
): boolean {
  const { manifestFingerprint, ...base } = manifest;
  return fingerprint(stableStringify(base)) === manifestFingerprint;
}

export function findActiveStrategyVersion(
  registry: StrategyVersionRegistry
): string | null {
  const active = registry.entries.filter(
    (entry) => entry.currentStatus === "ACTIVE"
  );
  if (active.length > 1) {
    throw new Error("Strategy registry invariant violated: more than one ACTIVE version.");
  }
  return active[0]?.manifest.version ?? null;
}

export function compareSemanticStrategyVersions(
  left: string,
  right: string
): number {
  const a = parseVersion(normalizeStrategyVersion(left));
  const b = parseVersion(normalizeStrategyVersion(right));
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function buildStrategyBaselineSnapshot(): StrategyBaselineSnapshot {
  return {
    engineConfig: structuredClone(defaultEngineConfig) as EngineConfig,
    strategyConfig: structuredClone(DEFAULT_STRATEGY_CONFIG),
    strategySystem: structuredClone(STRATEGY_SYSTEM_POLICY),
    scanner: {
      timeframeRoles: structuredClone(DEFAULT_TIMEFRAME_ROLES),
      signalTtl: structuredClone(DEFAULT_SIGNAL_TTL),
      freshness: structuredClone(DEFAULT_FRESHNESS_THRESHOLDS),
      candleLookback: DEFAULT_SCANNER_CONFIG.candleLookback,
    },
  };
}

function normalizeActor(value: string, label: string): string {
  const actor = value.trim();
  if (!actor) throw new Error(label + " is required.");
  if (actor.length > 80) throw new Error(label + " must be 80 characters or fewer.");
  return actor;
}

function normalizeTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("Strategy version title is required.");
  if (title.length > 120) {
    throw new Error("Strategy version title must be 120 characters or fewer.");
  }
  return title;
}

function normalizeNote(value: string): string {
  const note = value.trim();
  if (note.length > 2_000) {
    throw new Error("Strategy version note must be 2000 characters or fewer.");
  }
  return note;
}

function parseVersion(value: string): [number, number, number] {
  const match = value.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error("Invalid normalized strategy version.");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
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

function fingerprint(value: string): string {
  const left = fnv1a32(value, 0x811c9dc5);
  const right = fnv1a32(value, 0x9e3779b9);
  return toHex(left) + toHex(right);
}

function fnv1a32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function toHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}
