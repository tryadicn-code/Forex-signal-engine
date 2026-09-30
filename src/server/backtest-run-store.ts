import { promises as fs } from "node:fs";
import path from "node:path";
import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";
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

const DEFAULT_DIRECTORY = path.join(
  process.cwd(),
  ".data",
  "backtest-runs"
);

export class JsonFileBacktestRunStore {
  constructor(private readonly directory: string = DEFAULT_DIRECTORY) {}

  async save(artifact: BacktestRunArtifact): Promise<void> {
    validateArtifact(artifact);
    await writeDurableJson(this.filePath(artifact.id), artifact);
  }

  async read(id: string): Promise<BacktestRunArtifact | null> {
    const result = await readDurableJson(
      this.filePath(id),
      validateArtifact
    );
    return result.value;
  }

  async updateMetadata(
    id: string,
    input: { label?: string; tags?: string[] }
  ): Promise<BacktestRunArtifact | null> {
    const artifact = await this.read(id);
    if (!artifact) return null;

    const label = normalizeLabel(input.label ?? artifact.metadata?.label ?? "");
    const tags = normalizeTags(input.tags ?? artifact.metadata?.tags ?? []);
    const metadata: BacktestRunMetadata = {
      label,
      tags,
      updatedAt: Date.now(),
    };

    const next: BacktestRunArtifact = {
      ...artifact,
      metadata,
    };
    await this.save(next);
    return next;
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

    const next: BacktestRunArtifact = {
      ...artifact,
      releaseReview: review,
    };
    await this.save(next);
    return next;
  }

  async list(limit = 20): Promise<BacktestRunListItem[]> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("Backtest run list limit must be a positive integer.");
    }

    let entries: string[];
    try {
      entries = await fs.readdir(this.directory);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }

    const artifacts: BacktestRunArtifact[] = [];
    for (const entry of entries.filter((name) => name.endsWith(".json"))) {
      try {
        const result = await readDurableJson(
          path.join(this.directory, entry),
          validateArtifact
        );
        if (result.value) artifacts.push(result.value);
      } catch {
        // One unrecoverable report must not hide every other persisted run.
      }
    }

    return artifacts
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, limit)
      .map(toListItem);
  }

  private filePath(id: string): string {
    if (!/^backtest-[a-z0-9-]+$/i.test(id)) {
      throw new Error("Invalid backtest run id.");
    }
    return path.join(this.directory, id + ".json");
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

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}


function normalizeLabel(value: string): string {
  const label = value.trim();
  if (label.length > 80) {
    throw new Error("Backtest label must be 80 characters or fewer.");
  }
  return label;
}

function normalizeTags(values: string[]): string[] {
  if (!Array.isArray(values)) {
    throw new Error("Backtest tags must be an array.");
  }
  const normalized = [...new Set(
    values
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean)
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
