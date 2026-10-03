import type { BacktestReleaseReview } from "@/replay/release-gate-types";
import type { HistoricalBacktestAnalytics } from "@/replay/analytics-types";
import type {
  HistoricalExecutionSummary,
  HistoricalIntrabarConflictPolicy,
} from "@/replay/execution-types";
import type { HistoricalDatasetValidation } from "@/replay/import-types";

export interface BacktestRunConfig {
  datasetId: string;
  source: string;
  sourceUtcOffsetMinutes: number;
  assumedSpreadPips: number;
  startAt?: number | null;
  endAt?: number | null;
  initialBalance: number;
  riskPercent: number;
  intrabarConflictPolicy: HistoricalIntrabarConflictPolicy;
  maxOpenPositions: number;
  maxTotalOpenRiskPercent: number;
  /** Guard against accidentally launching an enormous synchronous replay. */
  maxReplaySteps?: number;
}

export interface ResolvedBacktestRunConfig {
  datasetId: string;
  source: string;
  sourceUtcOffsetMinutes: number;
  assumedSpreadPips: number;
  startAt: number;
  endAt: number;
  initialBalance: number;
  riskPercent: number;
  intrabarConflictPolicy: HistoricalIntrabarConflictPolicy;
  maxOpenPositions: number;
  maxTotalOpenRiskPercent: number;
  maxReplaySteps: number;
}

export interface BacktestRunMetadata {
  label: string;
  tags: string[];
  updatedAt: number;
}

export interface BacktestRunArtifact {
  schemaVersion: 1;
  id: string;
  createdAt: number;
  completedAt: number;
  durationMs: number;
  config: ResolvedBacktestRunConfig;
  validation: HistoricalDatasetValidation;
  execution: HistoricalExecutionSummary;
  analytics: HistoricalBacktestAnalytics;
  /** Optional user-authored organization metadata. Does not affect results. */
  metadata?: BacktestRunMetadata;
  /** Human release review bound to a reproducibility fingerprint. */
  releaseReview?: BacktestReleaseReview;
}

export interface BacktestRunListItem {
  id: string;
  createdAt: number;
  completedAt: number;
  durationMs: number;
  datasetId: string;
  source: string;
  startAt: number;
  endAt: number;
  symbols: string[];
  sampleSize: number;
  netReturnPercent: number;
  expectancyR: number | null;
  maxDrawdownPercent: number;
  winRate: number | null;
  profitFactor: number | null;
  averageR: number | null;
  riskPercent: number;
  assumedSpreadPips: number;
  intrabarConflictPolicy: HistoricalIntrabarConflictPolicy;
  label: string | null;
  tags: string[];
  releaseDecision: "PENDING" | "HOLD" | "PROMOTE" | null;
  releaseReviewedAt: number | null;
}

export class BacktestValidationError extends Error {
  readonly validation: HistoricalDatasetValidation;

  constructor(message: string, validation: HistoricalDatasetValidation) {
    super(message);
    this.name = "BacktestValidationError";
    this.validation = validation;
  }
}
