import type {
  DurableJob,
  TransactionalStateStore,
} from "@/transactional/types";

export interface DurableJobHandlerContext {
  ownerId: string;
  fencingToken: number;
  attempt: number;
}

export interface DurableJobWorkerOptions {
  queue: string;
  ownerId: string;
  leaseMs: number;
  retryDelayMs: number;
}

export type DurableJobHandler<T = unknown> = (
  job: DurableJob<T>,
  context: DurableJobHandlerContext
) => Promise<void>;

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

  try {
    await handler(job, {
      ownerId: options.ownerId,
      fencingToken: job.fencingToken,
      attempt: job.attempts,
    });

    const completed = await store.completeJob(
      job.id,
      options.ownerId,
      job.fencingToken
    );
    if (!completed) {
      throw new Error(
        "Durable job completion fencing check failed for " + job.id + "."
      );
    }
    return job;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    const retryAt =
      job.attempts < job.maxAttempts
        ? Date.now() + Math.max(0, options.retryDelayMs)
        : null;

    const failed = await store.failJob(
      job.id,
      options.ownerId,
      job.fencingToken,
      message,
      retryAt
    );
    if (!failed) {
      throw new Error(
        "Durable job failure fencing check failed for " +
          job.id +
          "; original error: " +
          message
      );
    }
    throw error;
  }
}
