import type { ReleaseReviewChecklist } from "@/replay/release-gate-types";

export const EMPTY_CHECKLIST: ReleaseReviewChecklist = {
  datasetQualityReviewed: false,
  assumptionsReviewed: false,
  reproducibilityReviewed: false,
  outOfSampleReviewed: false,
  statisticsReviewed: false,
  forwardPaper: "NOT_REVIEWED",
};