import type { PaperStore } from "@/paper/store";
import type { PaperStoreState } from "@/paper/types";
import type {
  ForwardValidationObservation,
  ForwardValidationStoreState,
} from "@/forward-validation/types";
import type {
  StrategyVersionRegistry,
  StrategyVersionManifest,
  RegisterStrategyVersionInput,
  RollbackStrategyVersionInput,
  DeprecateStrategyVersionInput,
  StrategyVersionEntry,
  StrategyVersionStatusEvent,
} from "@/replay/strategy-version-types";
import {
  compareSemanticStrategyVersions,
  findActiveStrategyVersion,
  normalizeStrategyVersion,
  verifyStrategyVersionManifest,
} from "@/replay/strategy-version-registry";
import type {
  ReleaseRuntimeAuditEvent,
  ReleaseRuntimeAuditLog,
  ReleaseRuntimeState,
} from "@/runtime/release-runtime-types";
import type {
  BacktestRunArtifact,
  BacktestRunListItem,
  BacktestRunMetadata,
} from "@/replay/backtest-run-types";
import type {
  BacktestReleaseReview,
  BacktestReleaseReviewInput,
} from "@/replay/release-gate-types";
import {
  buildReleaseEvidenceReview,
  validateReleaseReviewForPersistence,
} from "@/replay/release-gate";
import { TransactionalDocumentRepository } from "@/transactional/document-repository";
import type { TransactionalStateStore } from "@/transactional/types";

export class TransactionalPaperStore implements PaperStore {
  private revision: number | null | undefined;

  constructor(private readonly store: TransactionalStateStore) {}

  async load(): Promise<PaperStoreState | null> {
    const document = await this.store.read<PaperStoreState>("state/paper");
    if (!document) {
      this.revision = null;
      return null;
    }
    validatePaperStoreState(document.value);
    this.revision = document.revision;
    return structuredClone(document.value);
  }

  async save(state: PaperStoreState): Promise<void> {
    validatePaperStoreState(state);
    if (this.revision === undefined) {
      const current = await this.store.read<PaperStoreState>("state/paper");
      this.revision = current?.revision ?? null;
    }
    const saved = await this.store.compareAndSwap(
      "state/paper",
      this.revision,
      structuredClone(state)
    );
    this.revision = saved.revision;
  }
}

export class TransactionalForwardValidationStore {
  private readonly repo: TransactionalDocumentRepository<ForwardValidationStoreState>;
  constructor(
    store: TransactionalStateStore,
    private readonly maxObservations: number
  ) {
    this.repo = new TransactionalDocumentRepository(
      store,
      "state/forward-validation",
      validateForwardValidationState
    );
  }

  async read(): Promise<ForwardValidationStoreState> {
    return (
      (await this.repo.readValue()) ?? {
        schemaVersion: 1,
        protocol: "phase-7-forward-v1",
        observations: [],
      }
    );
  }

  async append(
    observation: ForwardValidationObservation
  ): Promise<ForwardValidationStoreState> {
    return this.repo.update((current) => {
      const state =
        current ?? {
          schemaVersion: 1 as const,
          protocol: "phase-7-forward-v1" as const,
          observations: [],
        };
      if (state.observations.some((item) => item.id === observation.id)) {
        return { next: state, result: state };
      }
      const next: ForwardValidationStoreState = {
        schemaVersion: 1,
        protocol: "phase-7-forward-v1",
        observations: [...state.observations, structuredClone(observation)]
          .sort((a, b) => a.observedAt - b.observedAt)
          .slice(-this.maxObservations),
      };
      return { next, result: next };
    });
  }
}

export class TransactionalStrategyVersionStore {
  private readonly repo: TransactionalDocumentRepository<StrategyVersionRegistry>;
  constructor(store: TransactionalStateStore) {
    this.repo = new TransactionalDocumentRepository(
      store,
      "state/strategy-registry",
      validateRegistry
    );
  }

  async read(): Promise<StrategyVersionRegistry> {
    return (await this.repo.readValue()) ?? emptyRegistry();
  }

  async register(
    manifest: StrategyVersionManifest,
    input: RegisterStrategyVersionInput
  ): Promise<StrategyVersionRegistry> {
    if (!verifyStrategyVersionManifest(manifest)) {
      throw new Error("Strategy manifest integrity verification failed.");
    }
    return this.repo.update((current) => {
      const registry = current ?? emptyRegistry();
      const version = normalizeStrategyVersion(manifest.version);
      if (registry.entries.some((entry) => entry.manifest.version === version)) {
        throw new Error("Strategy version " + version + " is already registered.");
      }
      const activeVersion = findActiveStrategyVersion(registry);
      const supersedes =
        input.supersedesVersion == null || input.supersedesVersion.trim() === ""
          ? null
          : normalizeStrategyVersion(input.supersedesVersion);
      if (activeVersion !== null && supersedes !== activeVersion) {
        throw new Error(
          "An ACTIVE strategy version already exists (" +
            activeVersion +
            "). Explicitly supersede that version before registering a new ACTIVE version."
        );
      }
      if (activeVersion === null && supersedes !== null) {
        throw new Error(
          "supersedesVersion was provided but no ACTIVE strategy version exists."
        );
      }

      const now = manifest.registeredAt;
      const entries = registry.entries.map(cloneEntry);
      if (activeVersion !== null) {
        const active = entries.find(
          (entry) => entry.manifest.version === activeVersion
        );
        if (!active) throw new Error("ACTIVE strategy version could not be resolved.");
        appendStatus(active, {
          status: "SUPERSEDED",
          changedAt: now,
          changedBy: manifest.registeredBy,
          reason: "Superseded by " + version + ".",
        });
      }
      entries.push({
        manifest: structuredClone(manifest),
        currentStatus: "ACTIVE",
        statusHistory: [{
          status: "ACTIVE",
          changedAt: now,
          changedBy: manifest.registeredBy,
          reason:
            "Registered from promoted validation report " +
            manifest.sourceReportId +
            ".",
        }],
      });

      const next: StrategyVersionRegistry = {
        schemaVersion: 1,
        protocol: "phase-5.9-v1",
        updatedAt: now,
        entries: sortEntries(entries),
      };
      return { next, result: next };
    });
  }

  async rollback(
    input: RollbackStrategyVersionInput
  ): Promise<StrategyVersionRegistry> {
    return this.repo.update((current) => {
      const registry = current ?? emptyRegistry();
      const version = normalizeStrategyVersion(input.version);
      const changedBy = normalizeActor(input.changedBy);
      const reason = input.reason.trim();
      if (!reason) throw new Error("Rolling back a strategy version requires a reason.");
      if (reason.length > 1000) throw new Error("Rollback reason must be 1000 characters or fewer.");

      const entries = registry.entries.map(cloneEntry);
      const target = entries.find((entry) => entry.manifest.version === version);
      if (!target) throw new Error("Strategy version " + version + " was not found.");
      if (target.currentStatus === "DEPRECATED") {
        throw new Error("A DEPRECATED strategy version cannot be reactivated.");
      }
      if (target.currentStatus === "ACTIVE") {
        throw new Error("Strategy version " + version + " is already ACTIVE.");
      }
      if (target.currentStatus !== "SUPERSEDED") {
        throw new Error("Only a SUPERSEDED version can be used as a rollback target.");
      }

      const activeVersion = findActiveStrategyVersion(registry);
      const now = Date.now();
      if (activeVersion !== null) {
        const active = entries.find((entry) => entry.manifest.version === activeVersion);
        if (!active) throw new Error("ACTIVE strategy version could not be resolved.");
        appendStatus(active, {
          status: "SUPERSEDED",
          changedAt: now,
          changedBy,
          reason: "Rolled back to " + version + ": " + reason,
        });
      }
      appendStatus(target, {
        status: "ACTIVE",
        changedAt: now,
        changedBy,
        reason:
          activeVersion === null
            ? "Reactivated by controlled rollback: " + reason
            : "Rollback from " + activeVersion + ": " + reason,
      });
      const next = { ...registry, updatedAt: now, entries: sortEntries(entries) };
      return { next, result: next };
    });
  }

  async deprecate(
    input: DeprecateStrategyVersionInput
  ): Promise<StrategyVersionRegistry> {
    return this.repo.update((current) => {
      const registry = current ?? emptyRegistry();
      const version = normalizeStrategyVersion(input.version);
      const changedBy = normalizeActor(input.changedBy);
      const reason = input.reason.trim();
      if (!reason) throw new Error("Deprecating a strategy version requires a reason.");
      if (reason.length > 1000) throw new Error("Deprecation reason must be 1000 characters or fewer.");

      const entries = registry.entries.map(cloneEntry);
      const entry = entries.find((item) => item.manifest.version === version);
      if (!entry) throw new Error("Strategy version " + version + " was not found.");
      if (entry.currentStatus === "DEPRECATED") {
        throw new Error("Strategy version " + version + " is already DEPRECATED.");
      }
      const now = Date.now();
      appendStatus(entry, {
        status: "DEPRECATED",
        changedAt: now,
        changedBy,
        reason,
      });
      const next = { ...registry, updatedAt: now, entries: sortEntries(entries) };
      return { next, result: next };
    });
  }
}

export class TransactionalReleaseRuntimeAuditStore {
  private readonly repo: TransactionalDocumentRepository<ReleaseRuntimeAuditLog>;
  constructor(
    store: TransactionalStateStore,
    private readonly maxEvents = 200
  ) {
    this.repo = new TransactionalDocumentRepository(
      store,
      "state/release-runtime-audit",
      validateAuditLog
    );
  }

  async read(): Promise<ReleaseRuntimeAuditLog> {
    return (
      (await this.repo.readValue()) ?? {
        schemaVersion: 1,
        protocol: "phase-6-runtime-v1",
        events: [],
      }
    );
  }

  async recordState(state: ReleaseRuntimeState): Promise<void> {
    const event = toAuditEvent(state);
    await this.repo.update((current) => {
      const log =
        current ?? {
          schemaVersion: 1 as const,
          protocol: "phase-6-runtime-v1" as const,
          events: [],
        };
      const previous = log.events[log.events.length - 1];
      if (previous && sameEvent(previous, event)) {
        return { next: log, result: undefined };
      }
      const next: ReleaseRuntimeAuditLog = {
        schemaVersion: 1,
        protocol: "phase-6-runtime-v1",
        events: [...log.events, event].slice(-this.maxEvents),
      };
      return { next, result: undefined };
    });
  }
}

export class TransactionalBacktestRunStore {
  constructor(private readonly store: TransactionalStateStore) {}

  async save(artifact: BacktestRunArtifact): Promise<void> {
    validateArtifact(artifact);
    const repo = this.repo(artifact.id);
    await repo.replace(artifact);
  }

  async read(id: string): Promise<BacktestRunArtifact | null> {
    return this.repo(id).readValue();
  }

  async updateMetadata(
    id: string,
    input: { label?: string; tags?: string[] }
  ): Promise<BacktestRunArtifact | null> {
    if (!(await this.read(id))) return null;
    return this.repo(id).update((artifact) => {
      if (!artifact) {
        throw new Error("Backtest run " + id + " disappeared during update.");
      }
      const label = normalizeLabel(input.label ?? artifact.metadata?.label ?? "");
      const tags = normalizeTags(input.tags ?? artifact.metadata?.tags ?? []);
      const metadata: BacktestRunMetadata = {
        label,
        tags,
        updatedAt: Date.now(),
      };
      const next = { ...artifact, metadata };
      return { next, result: next };
    });
  }

  async updateReleaseReview(
    id: string,
    input: BacktestReleaseReviewInput
  ): Promise<BacktestRunArtifact | null> {
    const artifact = await this.read(id);
    if (!artifact) return null;
    const evidence = buildReleaseEvidenceReview(artifact, {
      forwardEvidenceAvailable: input.forwardEvidence != null,
    });
    const review: BacktestReleaseReview = {
      decision: input.decision,
      reviewer: normalizeReviewer(input.reviewer),
      note: (input.note ?? "").trim(),
      checklist: { ...input.checklist },
      reviewedFingerprint: evidence.fingerprint,
      forwardEvidence: input.forwardEvidence
        ? {
            capturedAt: input.forwardEvidence.capturedAt,
            comparison: structuredClone(input.forwardEvidence.comparison),
          }
        : null,
      updatedAt: Date.now(),
    };
    validateReleaseReviewForPersistence(artifact, review);

    return this.repo(id).update((current) => {
      if (!current) {
        return { next: artifact, result: null };
      }
      const next = { ...current, releaseReview: review };
      return { next, result: next };
    });
  }

  async list(limit = 20): Promise<BacktestRunListItem[]> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("Backtest run list limit must be a positive integer.");
    }
    const documents = await this.store.list<BacktestRunArtifact>(
      "backtest/",
      Math.max(limit, 100)
    );
    return documents
      .map((item) => item.value)
      .filter((artifact) => {
        try {
          validateArtifact(artifact);
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, limit)
      .map(toListItem);
  }

  private repo(id: string): TransactionalDocumentRepository<BacktestRunArtifact> {
    if (!/^backtest-[a-z0-9-]+$/i.test(id)) {
      throw new Error("Invalid backtest run id.");
    }
    return new TransactionalDocumentRepository(
      this.store,
      "backtest/" + id,
      validateArtifact
    );
  }
}

function validatePaperStoreState(state: PaperStoreState): void {
  if (
    state.schemaVersion !== 1 ||
    !state.account ||
    !Array.isArray(state.orders) ||
    !Array.isArray(state.positions) ||
    !Array.isArray(state.trades) ||
    !Array.isArray(state.ledger)
  ) {
    throw new Error("Invalid Paper Trading store schema.");
  }
}

function validateForwardValidationState(
  state: ForwardValidationStoreState
): void {
  if (
    state.schemaVersion !== 1 ||
    state.protocol !== "phase-7-forward-v1" ||
    !Array.isArray(state.observations)
  ) {
    throw new Error("Invalid Phase 7 forward validation store.");
  }
}

function validateRegistry(registry: StrategyVersionRegistry): void {
  if (
    registry.schemaVersion !== 1 ||
    registry.protocol !== "phase-5.9-v1" ||
    !Array.isArray(registry.entries)
  ) {
    throw new Error("Invalid strategy version registry format.");
  }
  const versions = new Set<string>();
  let activeCount = 0;
  for (const entry of registry.entries) {
    const version = normalizeStrategyVersion(entry.manifest.version);
    if (versions.has(version)) {
      throw new Error("Duplicate strategy version in registry: " + version);
    }
    versions.add(version);
    if (!verifyStrategyVersionManifest(entry.manifest)) {
      throw new Error("Strategy manifest fingerprint mismatch for " + version + ".");
    }
    if (entry.statusHistory.length === 0) {
      throw new Error("Strategy version " + version + " has no status history.");
    }
    const lastStatus = entry.statusHistory[entry.statusHistory.length - 1].status;
    if (lastStatus !== entry.currentStatus) {
      throw new Error("Strategy version " + version + " status history is inconsistent.");
    }
    if (entry.currentStatus === "ACTIVE") activeCount += 1;
  }
  if (activeCount > 1) {
    throw new Error("Strategy registry may contain at most one ACTIVE version.");
  }
}

function validateAuditLog(log: ReleaseRuntimeAuditLog): void {
  if (
    log.schemaVersion !== 1 ||
    log.protocol !== "phase-6-runtime-v1" ||
    !Array.isArray(log.events)
  ) {
    throw new Error("Invalid release runtime audit format.");
  }
}

function validateArtifact(artifact: BacktestRunArtifact): void {
  if (
    artifact.schemaVersion !== 1 ||
    typeof artifact.id !== "string" ||
    !artifact.config ||
    !artifact.validation ||
    !artifact.execution ||
    !artifact.analytics
  ) {
    throw new Error("Invalid backtest run artifact.");
  }
}

function emptyRegistry(): StrategyVersionRegistry {
  return {
    schemaVersion: 1,
    protocol: "phase-5.9-v1",
    updatedAt: 0,
    entries: [],
  };
}

function sortEntries(entries: StrategyVersionEntry[]): StrategyVersionEntry[] {
  return [...entries].sort((a, b) =>
    compareSemanticStrategyVersions(
      b.manifest.version,
      a.manifest.version
    )
  );
}

function cloneEntry(entry: StrategyVersionEntry): StrategyVersionEntry {
  return structuredClone(entry);
}

function appendStatus(
  entry: StrategyVersionEntry,
  event: StrategyVersionStatusEvent
): void {
  entry.currentStatus = event.status;
  entry.statusHistory.push({ ...event });
}

function normalizeActor(value: string): string {
  const actor = value.trim();
  if (!actor) throw new Error("changedBy is required.");
  if (actor.length > 80) {
    throw new Error("changedBy must be 80 characters or fewer.");
  }
  return actor;
}

function toAuditEvent(state: ReleaseRuntimeState): ReleaseRuntimeAuditEvent {
  return {
    at: state.resolvedAt,
    status: state.status,
    reason: state.reason,
    version: state.version,
    manifestFingerprint: state.manifestFingerprint,
    activationAt: state.activationAt,
    defaultDrift: state.defaultDrift,
    driftAreas: [...state.driftAreas],
    message: state.message,
  };
}

function sameEvent(
  left: ReleaseRuntimeAuditEvent,
  right: ReleaseRuntimeAuditEvent
): boolean {
  return (
    left.status === right.status &&
    left.reason === right.reason &&
    left.version === right.version &&
    left.manifestFingerprint === right.manifestFingerprint &&
    left.activationAt === right.activationAt &&
    left.defaultDrift === right.defaultDrift &&
    left.driftAreas.join("|") === right.driftAreas.join("|") &&
    left.message === right.message
  );
}

function toListItem(artifact: BacktestRunArtifact): BacktestRunListItem {
  return {
    id: artifact.id,
    createdAt: artifact.createdAt,
    completedAt: artifact.completedAt,
    durationMs: artifact.durationMs,
    datasetId: artifact.config.datasetId,
    source: artifact.config.source,
    startAt: artifact.config.startAt,
    endAt: artifact.config.endAt,
    symbols: artifact.validation.symbols,
    sampleSize: artifact.analytics.sampleSize,
    netReturnPercent: artifact.analytics.netReturnPercent,
    expectancyR: artifact.analytics.expectancyR,
    maxDrawdownPercent: artifact.analytics.maxEquityDrawdownPercent,
    winRate: artifact.analytics.winRate,
    profitFactor: artifact.analytics.profitFactor,
    averageR: artifact.analytics.averageR,
    riskPercent: artifact.config.riskPercent,
    assumedSpreadPips: artifact.config.assumedSpreadPips,
    intrabarConflictPolicy: artifact.config.intrabarConflictPolicy,
    label: artifact.metadata?.label || null,
    tags: artifact.metadata?.tags ? [...artifact.metadata.tags] : [],
    releaseDecision: artifact.releaseReview?.decision ?? null,
    releaseReviewedAt: artifact.releaseReview?.updatedAt ?? null,
  };
}

function normalizeLabel(value: string): string {
  const label = value.trim();
  if (label.length > 80) {
    throw new Error("Backtest label must be 80 characters or fewer.");
  }
  return label;
}

function normalizeTags(values: string[]): string[] {
  if (!Array.isArray(values)) throw new Error("Backtest tags must be an array.");
  const normalized = [...new Set(
    values.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
  )];
  if (normalized.length > 8) {
    throw new Error("Backtest reports support at most 8 tags.");
  }
  for (const tag of normalized) {
    if (tag.length > 24) {
      throw new Error("Each backtest tag must be 24 characters or fewer.");
    }
  }
  return normalized;
}

function normalizeReviewer(value: string): string {
  const reviewer = value.trim();
  if (!reviewer) {
    throw new Error("Release review requires a reviewer name/identifier.");
  }
  if (reviewer.length > 80) {
    throw new Error("Release reviewer must be 80 characters or fewer.");
  }
  return reviewer;
}

