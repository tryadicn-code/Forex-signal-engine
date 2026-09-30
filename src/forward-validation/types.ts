import type {
  ComparablePerformance,
  HistoricalForwardComparison,
} from "@/replay/analytics-types";
import type { PaperTrade } from "@/paper/types";

export type ForwardValidationStatus =
  | "COLLECTING"
  | "MONITORING"
  | "ATTENTION";

export type ForwardIndicatorStatus =
  | "INSUFFICIENT_DATA"
  | "WITHIN_REFERENCE"
  | "OUTSIDE_REFERENCE"
  | "ATTENTION"
  | "INFO";

export interface ForwardValidationObservation {
  id: string;
  observedAt: number;
  strategyVersion: string;
  manifestFingerprint: string;
  activationAt: number;
  sourceReportId: string;
  providerState: string | null;
  symbolsRequested: number;
  symbolsSuccessful: number;
  symbolsFailed: number;
  freshness: {
    fresh: number;
    delayed: number;
    stale: number;
  };
  engineExecuteCount: number;
  lifecycleExecuteCount: number;
  paperFilledCount: number;
  paperRejectedCount: number;
}

export interface ForwardValidationStoreState {
  schemaVersion: 1;
  protocol: "phase-7-forward-v1";
  observations: ForwardValidationObservation[];
}

export interface ForwardDriftIndicator {
  id: string;
  category: "SAMPLE" | "PERFORMANCE" | "PATH_RISK" | "DATA_QUALITY" | "EXECUTION";
  label: string;
  status: ForwardIndicatorStatus;
  forwardValue: number | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  unit: "%" | "R" | "COUNT" | "RATIO";
  detail: string;
}

export interface ForwardOperationalSummary {
  observationCount: number;
  firstObservedAt: number | null;
  lastObservedAt: number | null;
  calendarSpanDays: number;
  symbolsRequested: number;
  symbolsFailed: number;
  providerFailureRatePercent: number;
  staleSymbolCount: number;
  staleDataRatePercent: number;
  engineExecuteCount: number;
  lifecycleExecuteCount: number;
  paperFilledCount: number;
  paperRejectedCount: number;
  paperConstraintRejectionRatePercent: number | null;
}

export interface ForwardValidationReport {
  schemaVersion: 1;
  protocol: "phase-7-forward-v1";
  generatedAt: number;
  status: ForwardValidationStatus;
  release: {
    version: string;
    title: string;
    manifestFingerprint: string;
    sourceReportId: string;
    activationAt: number;
  };
  sample: {
    tradeCount: number;
    firstTradeOpenedAt: number | null;
    lastTradeClosedAt: number | null;
    trades: PaperTrade[];
  };
  historical: ComparablePerformance;
  forward: ComparablePerformance;
  comparison: HistoricalForwardComparison;
  operational: ForwardOperationalSummary;
  forwardMaxDrawdownR: number;
  historicalP95DrawdownR: number | null;
  indicators: ForwardDriftIndicator[];
  counts: {
    insufficient: number;
    withinReference: number;
    outsideReference: number;
    attention: number;
    info: number;
  };
  interpretationNotes: string[];
}

export interface ForwardValidationUnavailable {
  schemaVersion: 1;
  protocol: "phase-7-forward-v1";
  generatedAt: number;
  status: "NO_ACTIVE_RELEASE";
  message: string;
}

export type ForwardValidationSnapshot =
  | ForwardValidationReport
  | ForwardValidationUnavailable;
