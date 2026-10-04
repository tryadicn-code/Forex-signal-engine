import type { NotificationChannelId } from "@/config/notifications";

export type AlertState =
  | "WATCH"
  | "NEAR_EXECUTE"
  | "EXECUTE_READY"
  | "BLOCKED"
  | "INVALIDATED";

export interface AlertCandidate {
  key: string;
  signalId: string;
  /** Strategy module that produced the signal. Null only on legacy events. */
  strategyId: string | null;
  symbol: string;
  direction: "LONG" | "SHORT";
  state: AlertState;
  detectedAt: number;
  strategyVersion: string;
  strategyActivationAt: number;
  latestPrice: number | null;
  biasScore: number | null;
  setupScore: number | null;
  triggerScore: number | null;
  riskReward: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  riskPercent: number | null;
  positionSize: number | null;
  freshness: string | null;
  waitingFor: string[];
  blockers: string[];
}

export type AlertEventStatus =
  | "QUEUED"
  | "SENT"
  | "PARTIAL"
  | "FAILED"
  | "SUPPRESSED";

export interface AlertEventRecord extends AlertCandidate {
  id: string;
  status: AlertEventStatus;
  channels: NotificationChannelId[];
  sentChannels: NotificationChannelId[];
  failedChannels: NotificationChannelId[];
  message: string;
  updatedAt: number;
}

export type NotificationDeliveryStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED";

export interface NotificationDelivery {
  id: string;
  eventId: string;
  eventKey: string;
  channel: NotificationChannelId;
  status: NotificationDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  claimedAt: number | null;
  lastError: string | null;
  providerMessageId: string | null;
  createdAt: number;
  updatedAt: number;
  message: string;
  /**
   * N8B-7: timestamp when the delivery exhausted maxAttempts and was moved
   * to the dead-letter queue. retryFailed() never touches deliveries with a
   * non-null value; the operator must explicitly force-retry them.
   */
  deadLetteredAt: number | null;
}

export interface NotificationStoreState {
  schemaVersion: 1;
  protocol: "phase-11-alerts-v1";
  events: AlertEventRecord[];
  deliveries: NotificationDelivery[];
}

export interface NotificationChannelHealth {
  channel: NotificationChannelId;
  enabled: boolean;
  configured: boolean;
  message: string;
}

export interface NotificationDashboard {
  protocol: "phase-11-alert-dashboard-v1";
  generatedAt: number;
  enabled: boolean;
  channels: NotificationChannelHealth[];
  recentEvents: AlertEventRecord[];
  pendingDeliveries: number;
  failedDeliveries: number;
  sentDeliveries: number;
  nearExecuteThresholds: {
    biasScore: number;
    setupScore: number;
    triggerScore: number;
    minRiskReward: number;
  };
  cooldownMs: number;
  error: string | null;
}

export interface NotificationSendResult {
  providerMessageId: string | null;
}

export interface NotificationAdapter {
  readonly channel: NotificationChannelId;
  send(message: string): Promise<NotificationSendResult>;
}
