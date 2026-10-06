import type { Timeframe } from "@/types/market";
import type { ReplayDataset } from "@/replay/types";

export const REQUIRED_BACKTEST_TIMEFRAMES = ["D1", "H4", "H1", "M15"] as const;
export type RequiredBacktestTimeframe =
  (typeof REQUIRED_BACKTEST_TIMEFRAMES)[number];

export type HistoricalImportSeverity = "ERROR" | "WARNING" | "INFO";

export interface HistoricalImportIssue {
  severity: HistoricalImportSeverity;
  code: string;
  message: string;
  fileName?: string;
  line?: number;
  symbol?: string;
  timeframe?: Timeframe;
}

export interface HistoricalFileSummary {
  fileName: string;
  symbol: string | null;
  timeframe: Timeframe | null;
  delimiter: "comma" | "semicolon" | "tab";
  rowCount: number;
  importedRows: number;
  duplicateRows: number;
  startAt: number | null;
  endAt: number | null;
}

export interface HistoricalSeriesCoverage {
  symbol: string;
  timeframe: Timeframe;
  candleCount: number;
  startAt: number;
  endAt: number;
  nonWeekendGapCount: number;
  largestGapMs: number;
}

export interface HistoricalDatasetValidation {
  valid: boolean;
  datasetId: string;
  source: string;
  sourceUtcOffsetMinutes: number;
  assumedSpreadPips: number;
  importedFileCount: number;
  importedSymbolCount: number;
  importedSeriesCount: number;
  files: HistoricalFileSummary[];
  series: HistoricalSeriesCoverage[];
  symbols: string[];
  /**
   * Symbols that lacked the full required timeframe set (D1/H4/H1/M15) and
   * were therefore used only as conversion-rate sources, never backtested.
   */
  auxiliarySymbols?: string[];
  commonStartAt: number | null;
  commonEndAt: number | null;
  estimatedM15Steps: number | null;
  issues: HistoricalImportIssue[];
}

export interface HistoricalTextFile {
  name: string;
  text: string;
}

export interface HistoricalCsvImportOptions {
  datasetId: string;
  source?: string;
  sourceUtcOffsetMinutes: number;
  assumedSpreadPips: number;
}

export interface HistoricalCsvImportResult {
  dataset: ReplayDataset | null;
  validation: HistoricalDatasetValidation;
}
