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

export async function executeAndPersistBacktest(
  files: HistoricalTextFile[],
  config: BacktestRunConfig
): Promise<BacktestRunArtifact> {
  const artifact = await runImportedBacktest(files, config);
  await store.save(artifact);
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
  return store.updateMetadata(id, input);
}

export async function updatePersistedBacktestReleaseReview(
  id: string,
  input: BacktestReleaseReviewInput
): Promise<BacktestRunArtifact | null> {
  return store.updateReleaseReview(id, input);
}
