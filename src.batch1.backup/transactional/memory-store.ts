import {
  TransactionConflictError,
  type DurableJob,
  type LeaseGrant,
  type TelemetryEvent,
  type TransactionalDocument,
  type TransactionalStateStore,
  type TransactionalStoreHealth,
} from "@/transactional/types";

interface MemoryDocument {
  revision: number;
  value: unknown;
  updatedAt: number;
}

interface MemoryLease {
  ownerId: string;
  fencingToken: number;
  expiresAt: number;
}

export class MemoryTransactionalStateStore
  implements TransactionalStateStore
{
  readonly mode = "memory" as const;
  readonly shared = false;

  private readonly documents = new Map<string, MemoryDocument>();
  private readonly leases = new Map<string, MemoryLease>();
  private readonly jobs = new Map<string, DurableJob>();
  private readonly telemetry: TelemetryEvent[] = [];
  private nextFencingToken = 1;

  async health(): Promise<TransactionalStoreHealth> {
    return {
      ok: true,
      mode: "memory",
      shared: false,
      latencyMs: 0,
      message: "In-memory transactional test store is available.",
    };
  }

  async read<T>(key: string): Promise<TransactionalDocument<T> | null> {
    const current = this.documents.get(key);
    if (!current) return null;
    return {
      key,
      revision: current.revision,
      value: structuredClone(current.value) as T,
      updatedAt: current.updatedAt,
    };
  }

  async compareAndSwap<T>(
    key: string,
    expectedRevision: number | null,
    value: T
  ): Promise<TransactionalDocument<T>> {
    const current = this.documents.get(key);
    const currentRevision = current?.revision ?? null;
    if (currentRevision !== expectedRevision) {
      throw new TransactionConflictError(
        key,
        expectedRevision,
        currentRevision
      );
    }

    const next = {
      revision: (current?.revision ?? 0) + 1,
      value: structuredClone(value),
      updatedAt: Date.now(),
    };
    this.documents.set(key, next);
    return {
      key,
      revision: next.revision,
      value: structuredClone(value),
      updatedAt: next.updatedAt,
    };
  }

  async list<T>(
    prefix: string,
    limit: number
  ): Promise<Array<TransactionalDocument<T>>> {
    return [...this.documents.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, limit)
      .map(([key, value]) => ({
        key,
        revision: value.revision,
        value: structuredClone(value.value) as T,
        updatedAt: value.updatedAt,
      }));
  }

  async acquireLease(
    name: string,
    ownerId: string,
    ttlMs: number
  ): Promise<LeaseGrant | null> {
    const now = Date.now();
    const current = this.leases.get(name);
    if (current && current.expiresAt > now && current.ownerId !== ownerId) {
      return null;
    }

    const lease: MemoryLease = {
      ownerId,
      fencingToken: this.nextFencingToken++,
      expiresAt: now + ttlMs,
    };
    this.leases.set(name, lease);
    return { name, ...lease };
  }

  async renewLease(
    grant: LeaseGrant,
    ttlMs: number
  ): Promise<LeaseGrant | null> {
    const current = this.leases.get(grant.name);
    const now = Date.now();
    if (
      !current ||
      current.ownerId !== grant.ownerId ||
      current.fencingToken !== grant.fencingToken ||
      current.expiresAt <= now
    ) {
      return null;
    }
    current.expiresAt = now + ttlMs;
    return { name: grant.name, ...current };
  }

  async releaseLease(grant: LeaseGrant): Promise<boolean> {
    const current = this.leases.get(grant.name);
    if (
      !current ||
      current.ownerId !== grant.ownerId ||
      current.fencingToken !== grant.fencingToken
    ) {
      return false;
    }
    this.leases.delete(grant.name);
    return true;
  }

  async enqueueJob<T>(
    input: Pick<
      DurableJob<T>,
      "id" | "queue" | "kind" | "payload" | "availableAt" | "maxAttempts"
    >
  ): Promise<DurableJob<T>> {
    const existing = this.jobs.get(input.id);
    if (existing) return structuredClone(existing) as DurableJob<T>;
    const now = Date.now();
    const job: DurableJob<T> = {
      ...structuredClone(input),
      status: "QUEUED",
      attempts: 0,
      leaseOwner: null,
      fencingToken: null,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
      lastError: null,
    };
    this.jobs.set(job.id, job as DurableJob);
    return structuredClone(job);
  }

  async claimJob<T>(
    queue: string,
    ownerId: string,
    leaseMs: number
  ): Promise<DurableJob<T> | null> {
    const now = Date.now();
    const candidate = [...this.jobs.values()]
      .filter(
        (job) =>
          job.queue === queue &&
          job.status !== "SUCCEEDED" &&
          job.status !== "FAILED" &&
          job.availableAt <= now &&
          (job.leaseExpiresAt === null || job.leaseExpiresAt <= now) &&
          job.attempts < job.maxAttempts
      )
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!candidate) return null;

    candidate.status = "RUNNING";
    candidate.attempts += 1;
    candidate.leaseOwner = ownerId;
    candidate.fencingToken = this.nextFencingToken++;
    candidate.leaseExpiresAt = now + leaseMs;
    candidate.updatedAt = now;
    return structuredClone(candidate) as DurableJob<T>;
  }

  async completeJob(
    id: string,
    ownerId: string,
    fencingToken: number
  ): Promise<boolean> {
    const job = this.jobs.get(id);
    if (
      !job ||
      job.leaseOwner !== ownerId ||
      job.fencingToken !== fencingToken
    ) {
      return false;
    }
    job.status = "SUCCEEDED";
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.updatedAt = Date.now();
    return true;
  }

  async failJob(
    id: string,
    ownerId: string,
    fencingToken: number,
    error: string,
    retryAt: number | null
  ): Promise<boolean> {
    const job = this.jobs.get(id);
    if (
      !job ||
      job.leaseOwner !== ownerId ||
      job.fencingToken !== fencingToken
    ) {
      return false;
    }
    job.lastError = error;
    job.updatedAt = Date.now();
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.fencingToken = null;
    if (retryAt !== null && job.attempts < job.maxAttempts) {
      job.status = "QUEUED";
      job.availableAt = retryAt;
    } else {
      job.status = "FAILED";
    }
    return true;
  }

  async emitTelemetry(event: TelemetryEvent): Promise<void> {
    this.telemetry.push(structuredClone(event));
    if (this.telemetry.length > 500) {
      this.telemetry.splice(0, this.telemetry.length - 500);
    }
  }

  async recentTelemetry(limit: number): Promise<TelemetryEvent[]> {
    return this.telemetry
      .slice(-limit)
      .reverse()
      .map((event) => structuredClone(event));
  }
}
