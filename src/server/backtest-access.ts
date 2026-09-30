import { runImportedBacktest } from "@/replay/imported-backtest-runner";
import type {
  BacktestRunArtifact,
  BacktestRunConfig,
  BacktestRunListItem,
} from "@/replay/backtest-run-types";
import type { BacktestReleaseReviewInput } from "@/replay/release-gate-types";
import type { HistoricalTextFile } from "@/replay/import-types";
import { JsonFileBacktestRunStore } from "@/server/backtest-run-store";

const store = new JsonFileBacktestRunStore();

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
