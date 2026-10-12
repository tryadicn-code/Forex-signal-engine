import type { BiasLabel, ExecutionDecision } from "@/types/market";
import type { FreshnessStatus } from "@/types/market-data";
import type { IntrabarConflictPolicy } from "@/config/paper";

export type PaperDirection = "LONG" | "SHORT";
export type PaperOrderStatus = "FILLED" | "REJECTED";
export type PaperPositionStatus = "OPEN" | "CLOSED";
export type PaperCloseReason =
  | "TAKE_PROFIT"
  | "PARTIAL_TAKE_PROFIT"
  | "STOP_LOSS"
  | "MANUAL_PAPER_CLOSE"
  | "DATA_SAFETY_CLOSE"
  | "AMBIGUOUS_BAR";

export interface PaperAccountConfigSnapshot {
  currency: string;
  initialBalance: number;
  createdAt: number;
}

export interface PaperReleaseIdentity {
  strategyVersion: string | null;
  strategyManifestFingerprint: string | null;
  strategySourceReportId: string | null;
  strategyActivationAt: number | null;
}

export interface PaperEngineSnapshot {
  /** Strategy that produced this execution. Optional on legacy persisted records. */
  strategyId?: string | null;
  bias: BiasLabel | null;
  setupScore: number | null;
  /**
   * TRD-017 Change A: engine decision at the time this snapshot was written.
   * Not always "EXECUTE" — a rejected order carries the actual decision value
   * that the scanner produced. Null on legacy records written before this fix.
   */
  executionDecision: ExecutionDecision | null;
  /**
   * TRD-017 Change A: freshness of the symbol at the time this snapshot was
   * written. Not always "FRESH" — a rejected order carries the actual status
   * (DELAYED or STALE) that caused paper to refuse the fill. Null on legacy
   * records written before this fix.
   */
  freshness: FreshnessStatus | null;
  engineVersion: string;
  paperConfigVersion: string;
  /** Phase 7 release identity; absent on legacy/unversioned Paper records. */
  strategyVersion?: string | null;
  strategyManifestFingerprint?: string | null;
  strategySourceReportId?: string | null;
  strategyActivationAt?: number | null;
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
  /** TRD-RR-003: TP1 target recorded on the order when the plan was PARTIAL. */
  tp1?: number | null;
  /** TRD-RR-003: TP2 target recorded on the order when the plan was PARTIAL. */
  tp2?: number | null;
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
  /** Maximum favorable excursion observed while the position was open, in R. */
  maxFavorableR?: number;
  /** Maximum adverse excursion observed while the position was open, in R. */
  maxAdverseR?: number;
  /**
   * TRD-RR-003: partial take-profit state. All optional so legacy v1
   * positions written before this change remain readable without migration;
   * the service layer must default them at read time:
   *   - tp1 = position.tp1 ?? null
   *   - remainingSize = position.remainingSize ?? position.positionSize
   *   - realizedPnL = position.realizedPnL ?? 0
   */
  tp1?: number | null;
  tp1SizePercent?: number;
  tp1HitAt?: number | null;
  tp2?: number | null;
  tp2SizePercent?: number;
  tp2HitAt?: number | null;
  remainingSize?: number;
  realizedPnL?: number;
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
  /** Maximum favorable excursion observed before close, in R. */
  maxFavorableR?: number;
  /** Maximum adverse excursion observed before close, in R. */
  maxAdverseR?: number;
  openedAt: number;
  closedAt: number;
  holdingDurationMs: number;
  closeReason: PaperCloseReason;
  engine: PaperEngineSnapshot;
}

export type PaperLedgerEventType =
  | "ACCOUNT_CREATED"
  | "TRADE_OPENED"
  | "TRADE_PARTIALLY_CLOSED"
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
    maxOpenPositionsPerSymbol: number;
    maxDirectionalCurrencyExposure: number;
    stopLossReentryCooldownMs: number;
    intrabarConflictPolicy: IntrabarConflictPolicy;
  };
  account: PaperAccountSummary;
  openPositions: PaperPosition[];
  recentTrades: PaperTrade[];
  recentOrders: PaperOrder[];
  performance: PaperPerformance;
  persistenceError: string | null;
}
