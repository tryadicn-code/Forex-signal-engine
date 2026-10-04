export type BrokerSide = "BUY" | "SELL";
export type BrokerExecutionRecordStatus =
  | "SHADOW_ACCEPTED"
  | "SHADOW_REJECTED"
  | "LIVE_PREFLIGHT_REJECTED"
  | "LIVE_SUBMITTING"
  | "LIVE_ACCEPTED"
  | "LIVE_REJECTED"
  | "RECONCILIATION_REQUIRED"
  | "RECONCILED";

export interface BrokerStatus {
  providerId: string;
  connected: boolean;
  tradeAllowed: boolean;
  expertTradingAllowed: boolean | null;
  terminalTradingAllowed: boolean | null;
  accountCurrency: string | null;
  balance: number | null;
  equity: number | null;
  message: string;
}

export interface BrokerOrderIntent {
  id: string;
  strategyId: string;
  idempotencyKey: string;
  clientTag: string;
  signalId: string;
  symbol: string;
  side: BrokerSide;
  volume: number;
  expectedEntry: number;
  stopLoss: number;
  takeProfit: number | null;
  riskPercent: number;
  accountCurrency: string;
  maxDeviationPoints: number;
  requestedAt: number;
  strategyVersion: string;
  strategyManifestFingerprint: string;
  strategyActivationAt: number;
}

export interface BrokerPreflightResult {
  ok: boolean;
  code: string;
  message: string;
  bid: number | null;
  ask: number | null;
  normalizedVolume: number | null;
}

export type BrokerOrderOutcome =
  | "FILLED"
  | "PLACED"
  | "PARTIAL"
  | "REJECTED"
  | "UNKNOWN";

export interface BrokerOrderResult {
  accepted: boolean;
  outcome: BrokerOrderOutcome;
  code: string;
  message: string;
  clientTag: string;
  orderId: string | null;
  dealId: string | null;
  positionId: string | null;
  filledPrice: number | null;
}

export interface BrokerPosition {
  ticket: string;
  symbol: string;
  side: BrokerSide;
  volume: number;
  priceOpen: number;
  stopLoss: number | null;
  takeProfit: number | null;
  currentPrice: number | null;
  profit: number | null;
  clientTag: string | null;
}

export interface BrokerReconciliationResult {
  found: boolean;
  state: "OPEN_POSITION" | "ACTIVE_ORDER" | "HISTORY_ORDER" | "HISTORY_DEAL" | "NOT_FOUND";
  clientTag: string;
  orderId: string | null;
  dealId: string | null;
  positionId: string | null;
  message: string;
}

export interface BrokerProvider {
  readonly id: string;
  status(): Promise<BrokerStatus>;
  preflight(intent: BrokerOrderIntent): Promise<BrokerPreflightResult>;
  placeOrder(intent: BrokerOrderIntent): Promise<BrokerOrderResult>;
  listOpenPositions(): Promise<BrokerPosition[]>;
  reconcile(clientTag: string): Promise<BrokerReconciliationResult>;
}

export interface LiveExecutionArm {
  approvedBy: string;
  reason: string;
  armedAt: number;
  expiresAt: number;
  remainingOrders: number;
  armId: string;
}

export interface BrokerExecutionControls {
  killSwitchEngaged: boolean;
  killSwitchChangedAt: number;
  killSwitchChangedBy: string;
  killSwitchReason: string;
  liveArm: LiveExecutionArm | null;
}

export interface BrokerExecutionRecord {
  id: string;
  /** Strategy that produced the execution; optional on legacy persisted records. */
  strategyId?: string | null;
  idempotencyKey: string;
  signalId: string;
  clientTag: string;
  symbol: string;
  side: BrokerSide;
  volume: number;
  riskPercent: number;
  mode: "SHADOW" | "LIVE";
  status: BrokerExecutionRecordStatus;
  createdAt: number;
  updatedAt: number;
  strategyVersion: string;
  strategyManifestFingerprint: string;
  strategyActivationAt: number;
  preflight: BrokerPreflightResult | null;
  brokerResult: BrokerOrderResult | null;
  reconciliation: BrokerReconciliationResult | null;
  message: string;
}

export interface BrokerExecutionStoreState {
  schemaVersion: 1;
  protocol: "phase-10-broker-v1";
  /**
   * B2-H3: last accepted fencing token.
   *
   * Every live-execution write inside a lease carries the lease fencing
   * token. The store rejects writes whose token is lower than this value,
   * preventing a paused writer from clobbering state after a newer owner has
   * taken the lease.
   */
  lastFencingToken?: number;
  controls: BrokerExecutionControls;
  records: BrokerExecutionRecord[];
}

export interface BrokerExecutionDashboard {
  protocol: "phase-10-broker-dashboard-v1";
  generatedAt: number;
  mode: "OFF" | "SHADOW" | "LIVE";
  providerId: string;
  liveExecutionEnabled: boolean;
  sharedStateRequiredForLive: true;
  controls: BrokerExecutionControls;
  brokerStatus: BrokerStatus;
  openPositions: BrokerPosition[];
  recentRecords: BrokerExecutionRecord[];
  unresolvedCount: number;
  liveReady: boolean;
  liveBlockers: string[];
}
