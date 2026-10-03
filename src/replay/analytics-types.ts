import type {
  HistoricalCloseReason,
  HistoricalDirection,
  HistoricalEquityPoint,
} from "@/replay/execution-types";

export interface HistoricalCurvePoint extends HistoricalEquityPoint {
  peakEquity: number;
  drawdownAmount: number;
  drawdownPercent: number;
  peakBalance: number;
  balanceDrawdownAmount: number;
  balanceDrawdownPercent: number;
}

export interface HistoricalRDistributionBin {
  key: string;
  label: string;
  minInclusive: number | null;
  maxExclusive: number | null;
  count: number;
  percent: number;
}

export interface HistoricalSegmentPerformance {
  key: string;
  label: string;
  sampleSize: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number | null;
  netPnL: number;
  netR: number;
  averageR: number | null;
  expectancyR: number | null;
  /** Per-trade Sharpe on R values. Not annualized. Null if stdDev = 0. */
  sharpeR: number | null;
  /** Per-trade Sortino on R values. Not annualized. Null if no losing trades. */
  sortinoR: number | null;
  profitFactor: number | null;
}

export interface HistoricalPerformanceSegments {
  byStrategy: HistoricalSegmentPerformance[];
  bySymbol: HistoricalSegmentPerformance[];
  byDirection: HistoricalSegmentPerformance[];
  byBias: HistoricalSegmentPerformance[];
  bySetupScore: HistoricalSegmentPerformance[];
  byEntrySession: HistoricalSegmentPerformance[];
  byCloseReason: HistoricalSegmentPerformance[];
}

export interface HistoricalBacktestAnalytics {
  sampleSize: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number | null;
  lossRate: number | null;

  initialBalance: number;
  finalBalance: number;
  netPnL: number;
  netReturnPercent: number;

  grossProfit: number;
  grossLoss: number;
  averageWin: number | null;
  averageLoss: number | null;
  payoffRatio: number | null;
  profitFactor: number | null;
  expectancyAmount: number | null;

  netR: number;
  averageR: number | null;
  medianR: number | null;
  standardDeviationR: number | null;
  expectancyR: number | null;
  /** Per-trade Sharpe on R values. Not annualized. Null if stdDev = 0. */
  sharpeR: number | null;
  /** Per-trade Sortino on R values. Not annualized. Null if no losing trades. */
  sortinoR: number | null;
  bestTradePnL: number | null;
  worstTradePnL: number | null;
  bestTradeR: number | null;
  worstTradeR: number | null;

  averageHoldingTimeMs: number | null;
  medianHoldingTimeMs: number | null;
  consecutiveWins: number;
  consecutiveLosses: number;

  maxEquityDrawdownAmount: number;
  maxEquityDrawdownPercent: number;
  maxEquityDrawdownAt: number | null;
  currentEquityDrawdownAmount: number;
  currentEquityDrawdownPercent: number;

  maxBalanceDrawdownAmount: number;
  maxBalanceDrawdownPercent: number;
  maxBalanceDrawdownAt: number | null;

  equityCurve: HistoricalCurvePoint[];
  rDistribution: HistoricalRDistributionBin[];
  segments: HistoricalPerformanceSegments;
}

export interface HistoricalAnalyticsOptions {
  /** Fixed UTC entry-session buckets used for deterministic segmentation. */
  sessionBuckets?: HistoricalSessionBucket[];
}

export interface HistoricalSessionBucket {
  key: string;
  label: string;
  startHourUtc: number;
  endHourUtc: number;
}

export interface ComparablePerformance {
  sampleSize: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancyR: number | null;
  /** Per-trade Sharpe on R values. Not annualized. Null if stdDev = 0. */
  sharpeR: number | null;
  /** Per-trade Sortino on R values. Not annualized. Null if no losing trades. */
  sortinoR: number | null;
  averageR: number | null;
  maxDrawdownPercent: number;
  netReturnPercent: number;
}

export interface HistoricalForwardComparison {
  historical: ComparablePerformance;
  forward: ComparablePerformance;
  delta: {
    sampleSize: number;
    winRate: number | null;
    profitFactor: number | null;
    expectancyR: number | null;
  /** Per-trade Sharpe on R values. Not annualized. Null if stdDev = 0. */
  sharpeR: number | null;
  /** Per-trade Sortino on R values. Not annualized. Null if no losing trades. */
  sortinoR: number | null;
    averageR: number | null;
    maxDrawdownPercent: number;
    netReturnPercent: number;
  };
}

export type HistoricalSegmentDimension =
  | "strategy"
  | "symbol"
  | "direction"
  | "bias"
  | "setupScore"
  | "entrySession"
  | "closeReason";

export interface HistoricalTradeClassification {
  strategy: string;
  symbol: string;
  direction: HistoricalDirection;
  bias: string;
  setupScore: string;
  entrySession: string;
  closeReason: HistoricalCloseReason;
}
