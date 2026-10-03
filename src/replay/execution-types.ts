import type { BiasLabel, Timeframe } from "@/types/market";

export type HistoricalDirection = "LONG" | "SHORT";
export type HistoricalOrderStatus = "FILLED" | "REJECTED";
export type HistoricalPositionStatus = "OPEN" | "CLOSED";
export type HistoricalCloseReason =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "AMBIGUOUS_BAR" | "MARGIN_CALL";

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
  /**
   * B3-C3: broker commission per side per 1.0 lot, in account currency.
   * A round trip pays this value twice. Default 0 means the backtest
   * omits commission.
   */
  commissionPerLotPerSide?: number;
  /**
   * B3-C3: swap cost for a LONG position per 1.0 lot per night, in account
   * currency. Positive means the broker charges (most common). Negative
   * would mean the broker credits (rare for retail FX).
   */
  swapLongPerLotPerNight?: number;
  /** B3-C3: swap cost for a SHORT position per 1.0 lot per night. */
  swapShortPerLotPerNight?: number;
  /**
   * B3-C3: UTC hour at which the daily swap rollover happens. Most brokers
   * use 21:00 or 22:00 UTC (17:00 New York). The simulator counts how many
   * times this hour is crossed while a position is open.
   */
  rolloverHourUtc?: number;
  /**
   * B3-H4: broker leverage used to compute required margin. Example 100 for
   * 1:100 leverage, 30 for 1:30. Undefined (default) disables both the
   * margin capacity check at open time and the forced liquidation pass,
   * preserving pre-B3-H4 behaviour. Production backtests should set this to
   * the real account leverage.
   */
  leverage?: number;
  /**
   * B3-H4: forced liquidation threshold expressed as a margin-level
   * percentage (equity / usedMargin * 100). When the margin level drops
   * below this value, the simulator force-closes the worst losing position
   * at the current bar close and re-checks. Default 50 matches the standard
   * MT5 stop-out level for retail accounts.
   */
  marginCallLevelPercent?: number;
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
