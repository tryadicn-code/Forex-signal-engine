export {
  calculateHistoricalAnalytics,
  compareHistoricalToForward,
  DEFAULT_HISTORICAL_SESSION_BUCKETS,
  toComparableHistoricalPerformance,
} from "@/replay/backtest-analytics";
export { HistoricalExecutionSimulator } from "@/replay/historical-execution-simulator";
export { HistoricalReplayClock } from "@/replay/replay-clock";
export { HistoricalReplayProvider } from "@/replay/historical-replay-provider";
export { HistoricalReplayRunner } from "@/replay/historical-replay-runner";
export type {
  ReplayDataset,
  ReplayRunConfig,
  ReplayRunResult,
  ReplayStep,
  ReplayStepHandler,
  ReplaySymbolData,
} from "@/replay/types";

export type {
  HistoricalCloseReason,
  HistoricalDirection,
  HistoricalEngineSnapshot,
  HistoricalExecutionConfig,
  HistoricalExecutionSummary,
  HistoricalIntrabarConflictPolicy,
  HistoricalOrder,
  HistoricalOrderStatus,
  HistoricalPosition,
  HistoricalPositionStatus,
  HistoricalTrade,
} from "@/replay/execution-types";

export type {
  ComparablePerformance,
  HistoricalAnalyticsOptions,
  HistoricalBacktestAnalytics,
  HistoricalCurvePoint,
  HistoricalForwardComparison,
  HistoricalPerformanceSegments,
  HistoricalRDistributionBin,
  HistoricalSegmentDimension,
  HistoricalSegmentPerformance,
  HistoricalSessionBucket,
} from "@/replay/analytics-types";

export { importHistoricalCsvFiles } from "@/replay/historical-csv-import";
export { runImportedBacktest } from "@/replay/imported-backtest-runner";
export {
  BacktestValidationError,
} from "@/replay/backtest-run-types";
export type {
  BacktestRunArtifact,
  BacktestRunConfig,
  BacktestRunListItem,
  ResolvedBacktestRunConfig,
} from "@/replay/backtest-run-types";
export type {
  HistoricalCsvImportOptions,
  HistoricalCsvImportResult,
  HistoricalDatasetValidation,
  HistoricalFileSummary,
  HistoricalImportIssue,
  HistoricalSeriesCoverage,
  HistoricalTextFile,
} from "@/replay/import-types";

export {
  getHistoricalSegmentRows,
  segmentDimensionLabel,
  toComparablePaperPerformance,
} from "@/replay/validation-workbench";
export type {
  BacktestRunMetadata,
} from "@/replay/backtest-run-types";
