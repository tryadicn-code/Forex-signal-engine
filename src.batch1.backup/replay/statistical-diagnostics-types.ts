export interface StatisticalInterval {
  confidenceLevel: number;
  estimate: number;
  lower: number;
  upper: number;
}

export interface BootstrapExpectancyDiagnostics {
  iterations: number;
  seed: number;
  interval: StatisticalInterval;
  positiveResampleFraction: number;
}

export interface TradeOrderMonteCarloDiagnostics {
  iterations: number;
  seed: number;
  observedMaxDrawdownR: number;
  medianMaxDrawdownR: number;
  p90MaxDrawdownR: number;
  p95MaxDrawdownR: number;
  p99MaxDrawdownR: number;
  worstMaxDrawdownR: number;
}

export type SampleWarningSeverity = "WARNING" | "INFO";

export interface SampleAdequacyWarning {
  code: string;
  severity: SampleWarningSeverity;
  scope: "FULL_SAMPLE" | "OUT_OF_SAMPLE" | "SEQUENTIAL_FOLDS";
  sampleSize: number;
  suggestedMinimum: number;
  message: string;
}

export interface BacktestStatisticalDiagnostics {
  sampleSize: number;
  winRateWilson95: StatisticalInterval | null;
  expectancyRBootstrap95: BootstrapExpectancyDiagnostics | null;
  tradeOrderMonteCarlo: TradeOrderMonteCarloDiagnostics | null;
  sampleWarnings: SampleAdequacyWarning[];
}

export interface ValidationSummaryExport {
  schemaVersion: 1;
  protocol: "phase-5.7-v1";
  report: {
    id: string;
    label: string | null;
    tags: string[];
    datasetId: string;
    source: string;
    symbols: string[];
    startAt: number;
    endAt: number;
  };
  assumptions: {
    sourceUtcOffsetMinutes: number;
    assumedSpreadPips: number;
    initialBalance: number;
    riskPercent: number;
    maxOpenPositions: number;
    maxTotalOpenRiskPercent: number;
    intrabarConflictPolicy: string;
  };
  reproducibility: {
    protocolVersion: string;
    algorithm: string;
    assumptions: string;
    outcomes: string;
    combined: string;
  };
  corePerformance: {
    sampleSize: number;
    winRate: number | null;
    profitFactor: number | null;
    expectancyR: number | null;
    averageR: number | null;
    netR: number;
    netReturnPercent: number;
    maxEquityDrawdownPercent: number;
  };
  holdout70_30: {
    splitAt: number;
    inSampleSampleSize: number;
    outOfSampleSampleSize: number;
    inSampleExpectancyR: number | null;
    outOfSampleExpectancyR: number | null;
    inSampleWinRate: number | null;
    outOfSampleWinRate: number | null;
  };
  sequential4Fold: {
    foldCount: number;
    foldsWithTrades: number;
    emptyFolds: number;
    validationTradeCount: number;
    positiveExpectancyFolds: number;
    nonPositiveExpectancyFolds: number;
    expectancyRMean: number | null;
    expectancyRStandardDeviation: number | null;
  };
  statisticalDiagnostics: BacktestStatisticalDiagnostics;
  interpretationNotes: string[];
}
