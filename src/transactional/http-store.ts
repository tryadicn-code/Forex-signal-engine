import {
  TransactionConflictError,
  type DurableJob,
  type LeaseGrant,
  type TelemetryEvent,
  type TransactionalDocument,
  type TransactionalStateStore,
  type TransactionalStoreHealth,
} from "@/transactional/types";

interface HttpTransactionalStoreOptions {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

export class HttpTransactionalStateStore
  implements TransactionalStateStore
{
  readonly mode = "remote" as const;
  readonly shared = true;

  private readonly baseUrl: string;

  constructor(private readonly options: HttpTransactionalStoreOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
  }

  async health(): Promise<TransactionalStoreHealth> {
    const started = Date.now();
    try {
      const payload = await this.rpc<{
        ok?: boolean;
        message?: string;
      }>("fse_health", {});
      return {
        ok: payload.ok !== false,
        mode: "remote",
        shared: true,
        latencyMs: Date.now() - started,
        message:
          payload.message ??
          "Shared transactional backend is reachable.",
      };
    } catch (error) {
      return {
        ok: false,
        mode: "remote",
        shared: true,
        latencyMs: Date.now() - started,
        message:
          "Shared transactional backend health check failed: " +
          (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  async read<T>(key: string): Promise<TransactionalDocument<T> | null> {
    return this.rpc<TransactionalDocument<T> | null>(
      "fse_state_read",
      { p_key: key }
    );
  }

  async compareAndSwap<T>(
    key: string,
    expectedRevision: number | null,
    value: T
  ): Promise<TransactionalDocument<T>> {
    const response = await this.rpc<
      | {
          ok: false;
          conflict: true;
          currentRevision: number | null;
        }
      | {
          ok: true;
          document: TransactionalDocument<T>;
        }
    >("fse_state_cas", {
      p_key: key,
      p_expected_revision: expectedRevision,
      p_value: value,
    });

    if (!response.ok) {
      throw new TransactionConflictError(
        key,
        expectedRevision,
        response.currentRevision
      );
    }
    return response.document;
  }

  async list<T>(
    prefix: string,
    limit: number
  ): Promise<Array<TransactionalDocument<T>>> {
    return this.rpc<Array<TransactionalDocument<T>>>(
      "fse_state_list",
      {
        p_prefix: prefix,
        p_limit: limit,
      }
    );
  }

  async acquireLease(
    name: string,
    ownerId: string,
    ttlMs: number
  ): Promise<LeaseGrant | null> {
    return this.rpc<LeaseGrant | null>("fse_lease_acquire", {
      p_name: name,
      p_owner_id: ownerId,
      p_ttl_ms: ttlMs,
    });
  }

  async renewLease(
    grant: LeaseGrant,
    ttlMs: number
  ): Promise<LeaseGrant | null> {
    return this.rpc<LeaseGrant | null>("fse_lease_renew", {
      p_name: grant.name,
      p_owner_id: grant.ownerId,
      p_fencing_token: grant.fencingToken,
      p_ttl_ms: ttlMs,
    });
  }

  async releaseLease(grant: LeaseGrant): Promise<boolean> {
    return this.rpc<boolean>("fse_lease_release", {
      p_name: grant.name,
      p_owner_id: grant.ownerId,
      p_fencing_token: grant.fencingToken,
    });
  }

  async enqueueJob<T>(
    job: Pick<
      DurableJob<T>,
      "id" | "queue" | "kind" | "payload" | "availableAt" | "maxAttempts"
    >
  ): Promise<DurableJob<T>> {
    return this.rpc<DurableJob<T>>("fse_job_enqueue", {
      p_id: job.id,
      p_queue: job.queue,
      p_kind: job.kind,
      p_payload: job.payload,
      p_available_at: job.availableAt,
      p_max_attempts: job.maxAttempts,
    });
  }

  async claimJob<T>(
    queue: string,
    ownerId: string,
    leaseMs: number
  ): Promise<DurableJob<T> | null> {
    return this.rpc<DurableJob<T> | null>("fse_job_claim", {
      p_queue: queue,
      p_owner_id: ownerId,
      p_lease_ms: leaseMs,
    });
  }

  async completeJob(
    id: string,
    ownerId: string,
    fencingToken: number
  ): Promise<boolean> {
    return this.rpc<boolean>("fse_job_complete", {
      p_id: id,
      p_owner_id: ownerId,
      p_fencing_token: fencingToken,
    });
  }

  async failJob(
    id: string,
    ownerId: string,
    fencingToken: number,
    error: string,
    retryAt: number | null
  ): Promise<boolean> {
    return this.rpc<boolean>("fse_job_fail", {
      p_id: id,
      p_owner_id: ownerId,
      p_fencing_token: fencingToken,
      p_error: error,
      p_retry_at: retryAt,
    });
  }

  async emitTelemetry(event: TelemetryEvent): Promise<void> {
    await this.rpc("fse_telemetry_emit", { p_event: event });
  }

  async recentTelemetry(limit: number): Promise<TelemetryEvent[]> {
    return this.rpc<TelemetryEvent[]>("fse_telemetry_recent", {
      p_limit: limit,
    });
  }

  private async rpc<T = unknown>(
    name: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs
    );

    try {
      const response = await fetch(
        this.baseUrl + "/rpc/" + name,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + this.options.token,
            apikey: this.options.token,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          cache: "no-store",
        }
      );

      const text = await response.text();
      if (!response.ok) {
        // H8E-E1-2: include the RPC name, HTTP status, and a truncated body
        // so operators can distinguish a rate limit from a 5xx from a 4xx.
        const body = text ? ": " + text.slice(0, 500) : "";
        throw new Error(
          "RPC " + name + " returned HTTP " + response.status + body
        );
      }
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch (error) {
        // H8E-E1-2: a non-JSON 200 response (proxy interstitial, misconfigured
        // PostgREST, or an HTML error page) must surface with context instead
        // of a bare SyntaxError. Mirrors the same fix applied to the broker
        // client in batch 5 and the notification adapters in batch 8b.
        const snippet =
          text.length > 200 ? text.slice(0, 200) + "..." : text;
        throw new Error(
          "RPC " +
            name +
            " returned non-JSON (HTTP " +
            response.status +
            "): " +
            (error instanceof Error ? error.message : String(error)) +
            ". Body: " +
            snippet
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
