import type { EngineConfig } from "@/core/config/engine-config";
import type { StrategyConfigBundle } from "@/core/strategies/config";
import type {
  FreshnessThresholds,
  SignalTtlConfig,
  TimeframeRoles,
} from "@/config/scanner";
import type { ReleaseGateAuditRecord } from "@/replay/release-gate-types";
import type { ValidationSummaryExport } from "@/replay/statistical-diagnostics-types";

export type StrategyVersionStatus =
  | "ACTIVE"
  | "SUPERSEDED"
  | "DEPRECATED";

export interface StrategyBaselineSnapshot {
  engineConfig: EngineConfig;
  /**
   * Multi-strategy thresholds. Optional only for pre-Phase-12 legacy manifests.
   * New manifests always persist this bundle.
   */
  strategyConfig?: StrategyConfigBundle;
  scanner: {
    timeframeRoles: TimeframeRoles;
    signalTtl: SignalTtlConfig;
    freshness: FreshnessThresholds;
    candleLookback: number;
  };
}

export interface StrategyVersionManifest {
  schemaVersion: 1;
  protocol: "phase-5.9-v1";
  version: string;
  title: string;
  note: string;
  registeredAt: number;
  registeredBy: string;
  sourceReportId: string;
  sourceDatasetId: string;
  symbols: string[];
  validationWindow: {
    startAt: number;
    endAt: number;
  };
  releaseReviewer: string;
  releaseReviewedAt: number;
  reviewedFingerprint: string;
  reproducibility: {
    assumptions: string;
    outcomes: string;
    combined: string;
  };
  strategySnapshot: StrategyBaselineSnapshot;
  validationSummary: ValidationSummaryExport;
  releaseGateAudit: ReleaseGateAuditRecord;
  manifestFingerprint: string;
}

export interface StrategyVersionStatusEvent {
  status: StrategyVersionStatus;
  changedAt: number;
  changedBy: string;
  reason: string;
}

export interface StrategyVersionEntry {
  manifest: StrategyVersionManifest;
  currentStatus: StrategyVersionStatus;
  statusHistory: StrategyVersionStatusEvent[];
}

export interface StrategyVersionRegistry {
  schemaVersion: 1;
  protocol: "phase-5.9-v1";
  updatedAt: number;
  entries: StrategyVersionEntry[];
}

export interface RegisterStrategyVersionInput {
  version: string;
  title?: string;
  note?: string;
  registeredBy: string;
  sourceReportId: string;
  supersedesVersion?: string | null;
}

export interface DeprecateStrategyVersionInput {
  version: string;
  changedBy: string;
  reason: string;
}


export interface RollbackStrategyVersionInput {
  version: string;
  changedBy: string;
  reason: string;
}
