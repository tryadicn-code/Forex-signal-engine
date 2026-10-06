import { runImportedBacktest } from "@/replay/imported-backtest-runner";
import {
  createBacktestJob,
  type BacktestJobInternal,
} from "@/server/backtest-job-registry";
import type {
  BacktestRunArtifact,
  BacktestRunConfig,
  BacktestRunListItem,
} from "@/replay/backtest-run-types";
import type { BacktestReleaseReviewInput } from "@/replay/release-gate-types";
import type { HistoricalTextFile } from "@/replay/import-types";
import { JsonFileBacktestRunStore } from "@/server/backtest-run-store";
import { TransactionalBacktestRunStore } from "@/transactional/domain-stores";
import {
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";

const store = sharedTransactionalMode()
  ? new TransactionalBacktestRunStore(transactionalStore())
  : new JsonFileBacktestRunStore();

type BacktestMutationGlobal = typeof globalThis & {
  __fseBacktestMutationQueue?: Promise<void>;
};

export async function executeAndPersistBacktest(
  files: HistoricalTextFile[],
  config: BacktestRunConfig
): Promise<BacktestRunArtifact> {
  const artifact = await runImportedBacktest(files, config);
  await withBacktestMutation(async () => {
    await store.save(artifact);
  });
  return artifact;
}

export function startBacktestJob(
  files: HistoricalTextFile[],
  config: BacktestRunConfig
): BacktestJobInternal {
  const job = createBacktestJob(config.datasetId);
  job.status = "RUNNING";
  job.startedAt = Date.now();
  job.lastProgressAt = Date.now();

  // Fire-and-forget: the async replay keeps running after the HTTP handler
  // returns the job id. Progress is written back into the registry; the
  // client polls /api/backtest/runs/[id] to observe it.
  void (async () => {
    try {
      const artifact = await runImportedBacktest(files, config, {
        signal: job.abortController.signal,
        onProgress: (completed, total) => {
          job.completedSteps = completed;
          if (total > 0 && job.totalSteps !== total) {
            job.totalSteps = total;
          }
          job.lastProgressAt = Date.now();
        },
      });
      await withBacktestMutation(async () => {
        await store.save(artifact);
      });
      job.artifact = artifact;
      job.status = "COMPLETED";
      job.completedAt = Date.now();
      job.lastProgressAt = Date.now();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unexpected backtest failure.";
      const isAbort =
        error instanceof Error &&
        (error.name === "AbortError" || /cancel/i.test(message));
      job.error = message;
      job.status = isAbort ? "CANCELLED" : "FAILED";
      job.completedAt = Date.now();
      job.lastProgressAt = Date.now();
    }
  })();

  return job;
}

export async function listPersistedBacktests(
  limit = 20
): Promise<BacktestRunListItem[]> {
  return store.list(limit);
}

export async function readPersistedBacktest(
  id: string
): Promise<BacktestRunArtifact | null> {
  return store.read(id);
}

export async function updatePersistedBacktestMetadata(
  id: string,
  input: { label?: string; tags?: string[] }
): Promise<BacktestRunArtifact | null> {
  return withBacktestMutation(() => store.updateMetadata(id, input));
}

export async function updatePersistedBacktestReleaseReview(
  id: string,
  input: BacktestReleaseReviewInput
): Promise<BacktestRunArtifact | null> {
  return withBacktestMutation(() =>
    store.updateReleaseReview(id, input)
  );
}

async function withBacktestMutation<T>(
  work: () => Promise<T>
): Promise<T> {
  const runtime = globalThis as BacktestMutationGlobal;
  const previous = runtime.__fseBacktestMutationQueue ?? Promise.resolve();

  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  runtime.__fseBacktestMutationQueue = previous
    .catch(() => undefined)
    .then(() => gate);

  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
  }
}
