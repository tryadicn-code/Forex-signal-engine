import type { HistoricalForwardComparison } from "@/replay/analytics-types";

export type ReleaseEvidenceStatus =
  | "SATISFIED"
  | "ATTENTION"
  | "MISSING"
  | "INFO";

export interface ReleaseEvidenceItem {
  id: string;
  category:
    | "DATASET"
    | "ASSUMPTIONS"
    | "REPRODUCIBILITY"
    | "OUT_OF_SAMPLE"
    | "SEQUENTIAL"
    | "STATISTICS"
    | "FORWARD";
  label: string;
  status: ReleaseEvidenceStatus;
  detail: string;
}

export interface ReleaseEvidenceReview {
  fingerprint: string;
  items: ReleaseEvidenceItem[];
  counts: Record<ReleaseEvidenceStatus, number>;
}

export type ReleaseDecision = "PENDING" | "HOLD" | "PROMOTE";

export type ForwardEvidenceReviewState =
  | "NOT_REVIEWED"
  | "REVIEWED"
  | "WAIVED";

export interface ReleaseReviewChecklist {
  datasetQualityReviewed: boolean;
  assumptionsReviewed: boolean;
  reproducibilityReviewed: boolean;
  outOfSampleReviewed: boolean;
  statisticsReviewed: boolean;
  forwardPaper: ForwardEvidenceReviewState;
}

export interface ForwardEvidenceSnapshot {
  capturedAt: number;
  comparison: HistoricalForwardComparison;
}

export interface BacktestReleaseReview {
  decision: ReleaseDecision;
  reviewer: string;
  note: string;
  checklist: ReleaseReviewChecklist;
  reviewedFingerprint: string;
  forwardEvidence: ForwardEvidenceSnapshot | null;
  updatedAt: number;
}

export interface BacktestReleaseReviewInput {
  decision: ReleaseDecision;
  reviewer: string;
  note?: string;
  checklist: ReleaseReviewChecklist;
  forwardEvidence?: ForwardEvidenceSnapshot | null;
}
