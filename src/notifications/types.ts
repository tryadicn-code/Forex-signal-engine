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
  /**
   * N8B-12: last HTTP status from the provider. Null on transport errors that
   * never produced a response.
   */
  lastHttpStatus: number | null;
  /**
   * N8B-12: provider request id (x-request-id for Telegram, x-fb-trace-id for
   * Meta) for correlating a failed delivery with the provider's own logs.
   */
  lastRequestId: string | null;
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

/**
 * N8B-4: structured error thrown by adapters when delivery fails.
 *
 * `retryAfterMs` is a hint from the provider (e.g. Telegram's retry_after in
 * seconds, WhatsApp's throttling codes). When non-null, the delivery service
 * uses it as the minimum delay before the next attempt instead of the
 * exponential backoff. This prevents a retry that the provider would only
 * reject again.
 *
 * `httpStatus` and `requestId` are observability fields: they make it
 * possible to correlate a failed delivery with the provider's own logs.
 */
export class NotificationDeliveryError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number | null = null,
    public readonly httpStatus: number | null = null,
    public readonly requestId: string | null = null
  ) {
    super(message);
    this.name = "NotificationDeliveryError";
  }
}

export interface NotificationAdapter {
  readonly channel: NotificationChannelId;
  send(message: string): Promise<NotificationSendResult>;
}
