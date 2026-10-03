import type { BiasLabel, Timeframe } from "@/types/market";

export type HistoricalDirection = "LONG" | "SHORT";
export type HistoricalOrderStatus = "FILLED" | "REJECTED";
export type HistoricalPositionStatus = "OPEN" | "CLOSED";
export type HistoricalCloseReason =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "AMBIGUOUS_BAR";

export type HistoricalIntrabarConflictPolicy =
  | "STOP_FIRST"
  | "TARGET_FIRST"
  | "REJECT_AMBIGUOUS";

export interface HistoricalExecutionConfig {
  enabled: boolean;
  /** Candle timeframe used to advance open positions. Defaults to M15. */
  executionTimeframe?: Timeframe;
  /**
   * Deterministic same-bar SL/TP policy. STOP_FIRST is the conservative default.
   */
  intrabarConflictPolicy?: HistoricalIntrabarConflictPolicy;
  /** Maximum concurrent historical positions. Defaults to 10. */
  maxOpenPositions?: number;
  /** Maximum aggregate open risk as percent of realized balance. Defaults to 5%. */
  maxTotalOpenRiskPercent?: number;
  /** Maximum concurrent positions per symbol. Defaults to 1. */
  maxOpenPositionsPerSymbol?: number;
  /** Maximum positions sharing the same directional currency leg. Defaults to 2. */
  maxDirectionalCurrencyExposure?: number;
  /** Cooldown after a stop loss before the same symbol may re-enter. Defaults to 60m. */
  stopLossReentryCooldownMs?: number;
  /**
   * B3-C1: when true, subtract the dataset's assumed spread from every
   * round-trip P&L so the backtest reflects a realistic cost per trade.
   * Defaults to false to preserve historical test fixtures.
   */
  applySpread?: boolean;
  /**
   * B3-C2: maximum allowed drift, in pips, between the strategy's frozen
   * entry and the current market price at execution time. Serves the same
   * role as MT5_TRADE_MAX_DEVIATION_POINTS on the live bridge: a signal
   * whose entry reference has moved farther than this is rejected rather
   * than filled at a stale price.
   *
   * Default is Infinity (drift check disabled) to preserve legacy fixture
   * behaviour; production backtests should set this to 2 to match the live
   * MT5 bridge (MT5_TRADE_MAX_DEVIATION_POINTS / 10).
   */
  maxEntryDriftPips?: number;
}

export interface HistoricalEngineSnapshot {
  /** Strategy that produced the historical execution; optional on legacy artifacts. */
  strategyId?: string | null;
  bias: BiasLabel | null;
  setupScore: number | null;
  executionDecision: "EXECUTE";
  freshness: "FRESH";
}

export interface HistoricalOrder {
  id: string;
  executionKey: string;
  signalId: string;
  symbol: string;
  side: HistoricalDirection;
  requestedAt: number;
  filledAt: number | null;
  requestedEntry: number;
  fillPrice: number | null;
  stopLoss: number;
  takeProfit: number | null;
  positionSize: number;
  riskAmount: number;
  riskPercent: number;
  plannedRR: number | null;
  status: HistoricalOrderStatus;
  rejectionReason: string | null;
  engine: HistoricalEngineSnapshot;
}

export interface HistoricalPosition {
  id: string;
  orderId: string;
  signalId: string;
  symbol: string;
  side: HistoricalDirection;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  positionSize: number;
  pipSize: number;
  pipValuePerLotAccountCurrency: number;
  riskAmount: number;
  riskPercent: number;
  plannedRR: number | null;
  openedAt: number;
  updatedAt: number;
  /** Open timestamp of newest execution candle already evaluated. */
  lastEvaluatedCandleTimestamp: number | null;
  status: HistoricalPositionStatus;
  unrealizedPnL: number;
  currentR: number;
  maxFavorableR?: number;
  maxAdverseR?: number;
  engine: HistoricalEngineSnapshot;
}

export interface HistoricalTrade {
  id: string;
  orderId: string;
  positionId: string;
  signalId: string;
  symbol: string;
  side: HistoricalDirection;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  positionSize: number;
  riskAmount: number;
  riskPercent: number;
  plannedRR: number | null;
  realizedPnL: number;
  realizedPnLPercent: number;
  realizedR: number;
  maxFavorableR?: number;
  maxAdverseR?: number;
  openedAt: number;
  closedAt: number;
  holdingDurationMs: number;
  closeReason: HistoricalCloseReason;
  engine: HistoricalEngineSnapshot;
}

export interface HistoricalEquityPoint {
  asOf: number;
  balance: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  openPositionCount: number;
  openRiskPercent: number;
}

export interface HistoricalExecutionSummary {
  enabled: true;
  executionTimeframe: Timeframe;
  intrabarConflictPolicy: HistoricalIntrabarConflictPolicy;
  initialBalance: number;
  balance: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  openRiskAmount: number;
  openRiskPercent: number;
  orderCount: number;
  openPositionCount: number;
  closedTradeCount: number;
  orders: HistoricalOrder[];
  openPositions: HistoricalPosition[];
  trades: HistoricalTrade[];
  /** End-of-replay-step mark-to-market history for Phase 5.3 analytics. */
  equityCurve: HistoricalEquityPoint[];
}
