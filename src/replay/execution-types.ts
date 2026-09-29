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
}

export interface HistoricalEngineSnapshot {
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
