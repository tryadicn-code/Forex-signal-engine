import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  BacktestRunArtifact,
  BacktestRunListItem,
} from "@/replay/backtest-run-types";

const DEFAULT_DIRECTORY = path.join(
  process.cwd(),
  ".data",
  "backtest-runs"
);

export class JsonFileBacktestRunStore {
  constructor(private readonly directory: string = DEFAULT_DIRECTORY) {}

  async save(artifact: BacktestRunArtifact): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    const filePath = this.filePath(artifact.id);
    const tempPath = filePath + ".tmp";
    const payload = JSON.stringify(artifact, null, 2);
    await fs.writeFile(tempPath, payload, "utf8");
    await fs.rename(tempPath, filePath);
  }

  async read(id: string): Promise<BacktestRunArtifact | null> {
    const filePath = this.filePath(id);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      return JSON.parse(raw) as BacktestRunArtifact;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async list(limit = 20): Promise<BacktestRunListItem[]> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("Backtest run list limit must be a positive integer.");
    }

    let entries: string[];
    try {
      entries = await fs.readdir(this.directory);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }

    const artifacts: BacktestRunArtifact[] = [];
    for (const entry of entries.filter((name) => name.endsWith(".json"))) {
      try {
        const raw = await fs.readFile(path.join(this.directory, entry), "utf8");
        artifacts.push(JSON.parse(raw) as BacktestRunArtifact);
      } catch {
        // One corrupt report must not hide every other persisted run.
      }
    }

    return artifacts
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, limit)
      .map(toListItem);
  }

  private filePath(id: string): string {
    if (!/^backtest-[a-z0-9-]+$/i.test(id)) {
      throw new Error("Invalid backtest run id.");
    }
    return path.join(this.directory, id + ".json");
  }
}

function toListItem(artifact: BacktestRunArtifact): BacktestRunListItem {
  return {
    id: artifact.id,
    createdAt: artifact.createdAt,
    completedAt: artifact.completedAt,
    durationMs: artifact.durationMs,
    datasetId: artifact.config.datasetId,
    source: artifact.config.source,
    startAt: artifact.config.startAt,
    endAt: artifact.config.endAt,
    symbols: artifact.validation.symbols,
    sampleSize: artifact.analytics.sampleSize,
    netReturnPercent: artifact.analytics.netReturnPercent,
    expectancyR: artifact.analytics.expectancyR,
    maxDrawdownPercent: artifact.analytics.maxEquityDrawdownPercent,
  };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
