export interface TransactionalDocument<T> {
  key: string;
  revision: number;
  value: T;
  updatedAt: number;
}

export interface TransactionalStoreHealth {
  ok: boolean;
  mode: "memory" | "remote";
  shared: boolean;
  latencyMs: number;
  message: string;
}

export interface LeaseGrant {
  name: string;
  ownerId: string;
  fencingToken: number;
  expiresAt: number;
}

export type DurableJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED";

export interface DurableJob<T = unknown> {
  id: string;
  queue: string;
  kind: string;
  payload: T;
  status: DurableJobStatus;
  availableAt: number;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string | null;
  fencingToken: number | null;
  leaseExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastError: string | null;
}

export interface TelemetryEvent {
  id: string;
  at: number;
  instanceId: string;
  category: string;
  name: string;
  level: "INFO" | "WARN" | "ERROR";
  durationMs: number | null;
  attributes: Record<string, string | number | boolean | null>;
}

export interface TransactionalStateStore {
  readonly mode: "memory" | "remote";
  readonly shared: boolean;

  health(): Promise<TransactionalStoreHealth>;
  read<T>(key: string): Promise<TransactionalDocument<T> | null>;
  compareAndSwap<T>(
    key: string,
    expectedRevision: number | null,
    value: T
  ): Promise<TransactionalDocument<T>>;
  list<T>(
    prefix: string,
    limit: number
  ): Promise<Array<TransactionalDocument<T>>>;

  acquireLease(
    name: string,
    ownerId: string,
    ttlMs: number
  ): Promise<LeaseGrant | null>;
  renewLease(
    grant: LeaseGrant,
    ttlMs: number
  ): Promise<LeaseGrant | null>;
  releaseLease(grant: LeaseGrant): Promise<boolean>;

  enqueueJob<T>(
    job: Pick<
      DurableJob<T>,
      "id" | "queue" | "kind" | "payload" | "availableAt" | "maxAttempts"
    >
  ): Promise<DurableJob<T>>;
  claimJob<T>(
    queue: string,
    ownerId: string,
    leaseMs: number
  ): Promise<DurableJob<T> | null>;
  completeJob(
    id: string,
    ownerId: string,
    fencingToken: number
  ): Promise<boolean>;
  failJob(
    id: string,
    ownerId: string,
    fencingToken: number,
    error: string,
    retryAt: number | null
  ): Promise<boolean>;

  emitTelemetry(event: TelemetryEvent): Promise<void>;
  recentTelemetry(limit: number): Promise<TelemetryEvent[]>;
}

export class TransactionConflictError extends Error {
  constructor(
    readonly key: string,
    readonly expectedRevision: number | null,
    readonly currentRevision: number | null
  ) {
    super(
      "Transactional state conflict for " +
        key +
        ": expected revision " +
        String(expectedRevision) +
        ", current revision " +
        String(currentRevision) +
        "."
    );
    this.name = "TransactionConflictError";
  }
}
