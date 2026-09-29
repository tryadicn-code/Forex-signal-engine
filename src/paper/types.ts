import type { BiasLabel } from "@/types/market";
import type { IntrabarConflictPolicy } from "@/config/paper";

export type PaperDirection = "LONG" | "SHORT";
export type PaperOrderStatus = "FILLED" | "REJECTED";
export type PaperPositionStatus = "OPEN" | "CLOSED";
export type PaperCloseReason =
  | "TAKE_PROFIT"
  | "STOP_LOSS"
  | "MANUAL_PAPER_CLOSE"
  | "DATA_SAFETY_CLOSE"
  | "AMBIGUOUS_BAR";

export interface PaperAccountConfigSnapshot {
  currency: string;
  initialBalance: number;
  createdAt: number;
}

export interface PaperEngineSnapshot {
  bias: BiasLabel | null;
  setupScore: number | null;
  executionDecision: "EXECUTE";
  freshness: "FRESH";
  engineVersion: string;
  paperConfigVersion: string;
}

export interface PaperOrder {
  id: string;
  executionKey: string;
  signalId: string;
  symbol: string;
  side: PaperDirection;
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
  status: PaperOrderStatus;
  rejectionReason: string | null;
  engine: PaperEngineSnapshot;
}

export interface PaperPosition {
  id: string;
  orderId: string;
  signalId: string;
  symbol: string;
  side: PaperDirection;
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
  /** Open timestamp of the newest full post-entry M15 candle already evaluated. */
  lastEvaluatedCandleTimestamp: number | null;
  status: PaperPositionStatus;
  unrealizedPnL: number;
  currentR: number;
  engine: PaperEngineSnapshot;
}

export interface PaperTrade {
  id: string;
  orderId: string;
  positionId: string;
  signalId: string;
  symbol: string;
  side: PaperDirection;
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
  closeReason: PaperCloseReason;
  engine: PaperEngineSnapshot;
}

export type PaperLedgerEventType =
  | "ACCOUNT_CREATED"
  | "TRADE_OPENED"
  | "TRADE_CLOSED"
  | "ORDER_REJECTED";

export interface PaperLedgerEvent {
  id: string;
  type: PaperLedgerEventType;
  timestamp: number;
  symbol: string | null;
  signalId: string | null;
  amount: number;
  note: string;
}

export interface PaperStoreState {
  schemaVersion: 1;
  account: PaperAccountConfigSnapshot;
  orders: PaperOrder[];
  positions: PaperPosition[];
  trades: PaperTrade[];
  ledger: PaperLedgerEvent[];
}

export interface PaperAccountSummary {
  currency: string;
  initialBalance: number;
  balance: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  openRiskAmount: number;
  openRiskPercent: number;
  openPositionCount: number;
  closedTradeCount: number;
}

export interface PaperPerformance {
  totalTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number | null;
  lossRate: number | null;
  grossProfit: number;
  grossLoss: number;
  netPnL: number;
  averageWin: number | null;
  averageLoss: number | null;
  averageR: number | null;
  medianR: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  expectancyR: number | null;
  maxDrawdownAmount: number;
  maxDrawdownPercent: number;
  currentDrawdownAmount: number;
  currentDrawdownPercent: number;
  bestTrade: number | null;
  worstTrade: number | null;
  averageHoldingTimeMs: number | null;
  consecutiveWins: number;
  consecutiveLosses: number;
}

export interface PaperDashboardData {
  enabled: boolean;
  config: {
    maxOpenPositions: number;
    maxTotalOpenRiskPercent: number;
    intrabarConflictPolicy: IntrabarConflictPolicy;
  };
  account: PaperAccountSummary;
  openPositions: PaperPosition[];
  recentTrades: PaperTrade[];
  recentOrders: PaperOrder[];
  performance: PaperPerformance;
  persistenceError: string | null;
}
