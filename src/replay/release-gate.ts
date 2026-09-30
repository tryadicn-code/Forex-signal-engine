import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  buildBacktestReproducibilityFingerprint,
  calculateSequentialValidation,
  calculateTemporalHoldout,
} from "@/replay/robustness-validation";
import { buildSampleAdequacyWarnings } from "@/replay/statistical-diagnostics";
import { toComparableHistoricalPerformance } from "@/replay/backtest-analytics";
import type {
  BacktestReleaseReview,
  ReleaseEvidenceItem,
  ReleaseGateAuditRecord,
  ReleaseEvidenceReview,
  ReleaseEvidenceStatus,
} from "@/replay/release-gate-types";

export function buildReleaseEvidenceReview(
  artifact: BacktestRunArtifact,
  options: { forwardEvidenceAvailable?: boolean } = {}
): ReleaseEvidenceReview {
  const fingerprint = buildBacktestReproducibilityFingerprint(artifact);
  const sampleWarnings = buildSampleAdequacyWarnings(artifact);
  const holdout = calculateTemporalHoldout(artifact, 0.7);
  const sequential = calculateSequentialValidation(artifact, 4);
  const items: ReleaseEvidenceItem[] = [];

  const validationErrors = artifact.validation.issues.filter(
    (issue) => issue.severity === "ERROR"
  );
  const validationWarnings = artifact.validation.issues.filter(
    (issue) => issue.severity === "WARNING"
  );

  items.push({
    id: "dataset-validity",
    category: "DATASET",
    label: "Dataset validation",
    status:
      !artifact.validation.valid || validationErrors.length > 0
        ? "MISSING"
        : validationWarnings.length > 0
          ? "ATTENTION"
          : "SATISFIED",
    detail:
      !artifact.validation.valid || validationErrors.length > 0
        ? "Historical dataset has blocking validation errors."
        : validationWarnings.length > 0
          ? validationWarnings.length +
            " dataset warning(s) remain visible for manual review."
          : "Dataset validation completed without blocking errors or warnings.",
  });

  items.push({
    id: "assumption-context",
    category: "ASSUMPTIONS",
    label: "Execution assumptions recorded",
    status: "SATISFIED",
    detail:
      "Spread, broker-time offset, risk, exposure limits and same-bar policy are recorded in the report.",
  });

  items.push({
    id: "reproducibility",
    category: "REPRODUCIBILITY",
    label: "Reproducibility identity",
    status: "SATISFIED",
    detail:
      "Combined fingerprint " +
      fingerprint.combined +
      " binds the recorded assumptions and historical outcomes.",
  });

  const oos = holdout.outOfSample.metrics;
  items.push({
    id: "oos-sample",
    category: "OUT_OF_SAMPLE",
    label: "70/30 out-of-sample evidence",
    status:
      oos.sampleSize === 0
        ? "MISSING"
        : oos.sampleSize < 30
          ? "ATTENTION"
          : "SATISFIED",
    detail:
      oos.sampleSize === 0
        ? "No closed trades entered during the default OOS period."
        : "OOS sample N=" +
          oos.sampleSize +
          ", expectancy R=" +
          formatMetric(oos.expectancyR) +
          ".",
  });

  items.push({
    id: "sequential-coverage",
    category: "SEQUENTIAL",
    label: "Sequential validation coverage",
    status:
      sequential.diagnostics.foldsWithTrades === 0
        ? "MISSING"
        : sequential.diagnostics.emptyFolds > 0 ||
            (sequential.diagnostics.validationSampleMin ?? 0) < 10
          ? "ATTENTION"
          : "SATISFIED",
    detail:
      sequential.diagnostics.foldsWithTrades +
      "/" +
      sequential.diagnostics.foldCount +
      " folds contain validation trades; " +
      sequential.diagnostics.emptyFolds +
      " fold(s) are empty.",
  });

  const warningCount = sampleWarnings.filter(
    (warning) => warning.severity === "WARNING"
  ).length;
  items.push({
    id: "statistical-diagnostics",
    category: "STATISTICS",
    label: "Statistical diagnostics",
    status:
      artifact.analytics.sampleSize === 0
        ? "MISSING"
        : warningCount > 0
          ? "ATTENTION"
          : "SATISFIED",
    detail:
      artifact.analytics.sampleSize === 0
        ? "No closed trades are available for confidence/resampling diagnostics."
        : "Wilson, bootstrap and trade-order diagnostics are available with " +
          warningCount +
          " sample warning(s).",
  });

  const persistedForwardIsCurrent =
    artifact.releaseReview?.reviewedFingerprint === fingerprint.combined &&
    artifact.releaseReview.forwardEvidence !== null &&
    artifact.releaseReview.forwardEvidence !== undefined;
  const forwardAvailable =
    options.forwardEvidenceAvailable || persistedForwardIsCurrent;
  items.push({
    id: "forward-paper",
    category: "FORWARD",
    label: "Forward Paper evidence",
    status: forwardAvailable ? "INFO" : "MISSING",
    detail: forwardAvailable
      ? "A Paper-forward comparison snapshot is available for human review."
      : "No Paper-forward comparison snapshot is attached to this report review.",
  });

  return {
    fingerprint: fingerprint.combined,
    items,
    counts: countStatuses(items),
  };
}

export function buildReleaseGateAuditRecord(
  artifact: BacktestRunArtifact
): ReleaseGateAuditRecord {
  const evidence = buildReleaseEvidenceReview(artifact);
  return {
    schemaVersion: 1,
    protocol: "phase-5.8-v1",
    reportId: artifact.id,
    datasetId: artifact.config.datasetId,
    fingerprint: evidence.fingerprint,
    evidence,
    review: artifact.releaseReview
      ? structuredClone(artifact.releaseReview)
      : null,
    reviewCurrent: isReleaseReviewCurrent(artifact),
  };
}

export function isReleaseReviewCurrent(
  artifact: BacktestRunArtifact
): boolean {
  const review = artifact.releaseReview;
  if (!review) return false;
  const current =
    buildBacktestReproducibilityFingerprint(artifact).combined;
  return review.reviewedFingerprint === current;
}

export function validateReleaseReviewForPersistence(
  artifact: BacktestRunArtifact,
  review: BacktestReleaseReview
): void {
  if (!review.reviewer.trim()) {
    throw new Error("Release review requires a reviewer name/identifier.");
  }
  if (review.reviewer.trim().length > 80) {
    throw new Error("Release reviewer must be 80 characters or fewer.");
  }
  if (review.note.length > 2_000) {
    throw new Error("Release review note must be 2000 characters or fewer.");
  }

  const current =
    buildBacktestReproducibilityFingerprint(artifact).combined;
  if (review.reviewedFingerprint !== current) {
    throw new Error(
      "Release review fingerprint does not match the current report."
    );
  }

  if (
    review.checklist.forwardPaper === "REVIEWED" &&
    review.forwardEvidence === null
  ) {
    throw new Error(
      "Forward Paper marked REVIEWED requires a captured comparison snapshot."
    );
  }

  if (review.forwardEvidence !== null) {
    const expectedHistorical =
      toComparableHistoricalPerformance(artifact.analytics);
    if (
      !sameComparable(
        review.forwardEvidence.comparison.historical,
        expectedHistorical
      )
    ) {
      throw new Error(
        "Forward Paper snapshot does not match the current historical report."
      );
    }
  }

  if (review.decision === "PROMOTE") {
    const checklist = review.checklist;
    const coreReviewed =
      checklist.datasetQualityReviewed &&
      checklist.assumptionsReviewed &&
      checklist.reproducibilityReviewed &&
      checklist.outOfSampleReviewed &&
      checklist.statisticsReviewed;
    if (!coreReviewed) {
      throw new Error(
        "PROMOTE requires every core manual review checkbox to be completed."
      );
    }
    if (checklist.forwardPaper === "NOT_REVIEWED") {
      throw new Error(
        "PROMOTE requires Forward Paper to be REVIEWED or explicitly WAIVED."
      );
    }
  }
}

function countStatuses(
  items: ReleaseEvidenceItem[]
): Record<ReleaseEvidenceStatus, number> {
  const counts: Record<ReleaseEvidenceStatus, number> = {
    SATISFIED: 0,
    ATTENTION: 0,
    MISSING: 0,
    INFO: 0,
  };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

function formatMetric(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(2);
}


function sameComparable(
  left: ReturnType<typeof toComparableHistoricalPerformance>,
  right: ReturnType<typeof toComparableHistoricalPerformance>
): boolean {
  return (
    left.sampleSize === right.sampleSize &&
    left.winRate === right.winRate &&
    left.profitFactor === right.profitFactor &&
    left.expectancyR === right.expectancyR &&
    left.averageR === right.averageR &&
    left.maxDrawdownPercent === right.maxDrawdownPercent &&
    left.netReturnPercent === right.netReturnPercent
  );
}
