export interface RobustnessPeriodMetrics {
  sampleSize: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number | null;
  profitFactor: number | null;
  netPnL: number;
  netR: number;
  averageR: number | null;
  medianR: number | null;
  expectancyR: number | null;
  maxConsecutiveLosses: number;
}

export interface TemporalHoldoutResult {
  splitRatio: number;
  splitAt: number;
  inSample: {
    startAt: number;
    endAt: number;
    metrics: RobustnessPeriodMetrics;
  };
  outOfSample: {
    startAt: number;
    endAt: number;
    metrics: RobustnessPeriodMetrics;
  };
  delta: {
    sampleSize: number;
    winRate: number | null;
    profitFactor: number | null;
    expectancyR: number | null;
    averageR: number | null;
    netR: number;
  };
}

export interface SequentialValidationFold {
  index: number;
  developmentStartAt: number;
  developmentEndAt: number;
  validationStartAt: number;
  validationEndAt: number;
  development: RobustnessPeriodMetrics;
  validation: RobustnessPeriodMetrics;
}

export interface SequentialValidationDiagnostics {
  foldCount: number;
  foldsWithTrades: number;
  positiveExpectancyFolds: number;
  nonPositiveExpectancyFolds: number;
  emptyFolds: number;
  expectancyRMean: number | null;
  expectancyRStandardDeviation: number | null;
  expectancyRMin: number | null;
  expectancyRMax: number | null;
  winRateStandardDeviation: number | null;
  validationSampleMin: number | null;
  validationSampleMax: number | null;
  validationTradeCount: number;
}

export interface SequentialValidationResult {
  foldCount: number;
  folds: SequentialValidationFold[];
  diagnostics: SequentialValidationDiagnostics;
}

export interface BacktestReproducibilityFingerprint {
  protocolVersion: "phase-5.6-v1";
  algorithm: "fnv1a32x2";
  assumptions: string;
  outcomes: string;
  combined: string;
}
