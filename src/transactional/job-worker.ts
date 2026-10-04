import type {
  DurableJob,
  TransactionalStateStore,
} from "@/transactional/types";

export interface DurableJobHandlerContext {
  ownerId: string;
  fencingToken: number;
  /**
   * 1-indexed attempt number of the current claim. The first claim is
   * attempt 1, matching the DurableJob.attempts field set by the store.
   */
  attempt: number;
}

export interface DurableJobWorkerOptions {
  queue: string;
  ownerId: string;
  leaseMs: number;
  /**
   * Base retry delay. Attempt N waits `base * 2^(N-1)` ms before the next
   * try, capped at maxRetryDelayMs and spread by jitterRatio.
   */
  retryDelayMs: number;
  /** Cap on the computed backoff. Defaults to 30 minutes. */
  maxRetryDelayMs?: number;
  /** Fraction of `retryDelayMs` added as random jitter (0..1). Default 0.25. */
  jitterRatio?: number;
}

export type DurableJobHandler<T = unknown> = (
  job: DurableJob<T>,
  context: DurableJobHandlerContext
) => Promise<void>;

/**
 * Claim and run at most one durable job.
 *
 * Handler contract (H8E2-1 / H8E2-2):
 *
 * The handler is only guaranteed to run once per claim. If the handler runs
 * longer than `leaseMs`, the lease expires and a peer may claim the same
 * job while this invocation is still executing. If the store acknowledges
 * completion but the network drops before we observe the ack, the job stays
 * RUNNING and lease expiry lets a peer retry it. In both cases the handler
 * is invoked more than once for a single logical job.
 *
 * The handler MUST therefore be idempotent: safe to run twice on the same
 * payload. Use a deterministic operation key derived from `job.id` and
 * `job.kind` if the side effect is not naturally idempotent.
 */
export async function runOneDurableJob<T>(
  store: TransactionalStateStore,
  options: DurableJobWorkerOptions,
  handler: DurableJobHandler<T>
): Promise<DurableJob<T> | null> {
  const job = await store.claimJob<T>(
    options.queue,
    options.ownerId,
    options.leaseMs
  );
  if (!job) return null;
  if (job.fencingToken === null) {
    throw new Error("Claimed durable job has no fencing token.");
  }
  const fencingToken = job.fencingToken;

  // --- Phase 1: run the handler. A throw here IS a handler failure. ---
  try {
    await handler(job, {
      ownerId: options.ownerId,
      fencingToken,
      attempt: job.attempts,
    });
  } catch (handlerError) {
    await recordHandlerFailure(
      store,
      options,
      job,
      fencingToken,
      handlerError
    );
    throw handlerError;
  }

  // --- Phase 2: mark the job complete. The side effect already happened. ---
  // A failure here is NOT a job failure. Calling failJob would schedule a
  // retry, and the next claim would invoke the handler a second time on a
  // job whose side effect already landed. We leave the job RUNNING and let
  // lease expiry drive peer retries; the handler's idempotency contract
  // covers the duplicate invocation.
  const completed = await store.completeJob(
    job.id,
    options.ownerId,
    fencingToken
  );
  if (!completed) {
    throw new Error(
      "Durable job completion fencing check failed for " + job.id +
      "; another worker may have taken over after lease expiry."
    );
  }
  return job;
}

async function recordHandlerFailure<T>(
  store: TransactionalStateStore,
  options: DurableJobWorkerOptions,
  job: DurableJob<T>,
  fencingToken: number,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const retryAt =
    job.attempts < job.maxAttempts
      ? Date.now() + computeRetryDelay(options, job.attempts)
      : null;

  try {
    const failed = await store.failJob(
      job.id,
      options.ownerId,
      fencingToken,
      message,
      retryAt
    );
    if (!failed) {
      // Another worker may already own this job. Do not throw a second
      // time; the caller needs the original handler error.
      console.warn(
        "[job-worker] failJob fencing check failed for " + job.id +
          "; another worker may own the job now."
      );
    }
  } catch (failError) {
    // Network error while recording the failure. Also do not mask the
    // original handler error.
    console.warn(
      "[job-worker] failJob threw for " + job.id + ": " +
        (failError instanceof Error ? failError.message : String(failError))
    );
  }
}

function computeRetryDelay(
  options: DurableJobWorkerOptions,
  attempts: number
): number {
  const base = Math.max(0, options.retryDelayMs);
  const maxDelay = options.maxRetryDelayMs ?? 30 * 60_000;
  const ratio = options.jitterRatio ?? 0.25;
  // Exponential backoff: base * 2^(attempts - 1), capped at maxDelay.
  const exponential = base * Math.pow(2, Math.max(0, attempts - 1));
  const capped = Math.min(exponential, maxDelay);
  // Jitter: 0..ratio * base added on top so simultaneous retries spread out.
  const jitter = ratio > 0 ? Math.random() * base * ratio : 0;
  return Math.floor(capped + jitter);
}