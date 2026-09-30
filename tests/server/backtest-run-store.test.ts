import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonFileBacktestRunStore } from "@/server/backtest-run-store";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";

const directories: string[] = [];

async function makeStore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fse-backtest-"));
  directories.push(directory);
  return new JsonFileBacktestRunStore(directory);
}

function artifact(): BacktestRunArtifact {
  return {
    schemaVersion: 1,
    id: "backtest-metadata-test-abc123",
    createdAt: 1,
    completedAt: 2,
    durationMs: 1,
    config: {
      datasetId: "metadata-test",
      source: "unit-test",
      sourceUtcOffsetMinutes: 0,
      assumedSpreadPips: 1,
      startAt: 100,
      endAt: 200,
      initialBalance: 10_000,
      riskPercent: 0.5,
      intrabarConflictPolicy: "STOP_FIRST",
      maxOpenPositions: 10,
      maxTotalOpenRiskPercent: 5,
      maxReplaySteps: 50_000,
    },
    validation: {
      valid: true,
      datasetId: "metadata-test",
      source: "unit-test",
      sourceUtcOffsetMinutes: 0,
      assumedSpreadPips: 1,
      importedFileCount: 4,
      importedSymbolCount: 1,
      importedSeriesCount: 4,
      files: [],
      series: [],
      symbols: ["EURUSD"],
      commonStartAt: 100,
      commonEndAt: 200,
      estimatedM15Steps: 1,
      issues: [],
    },
    execution: {} as BacktestRunArtifact["execution"],
    analytics: {
      sampleSize: 20,
      winRate: 55,
      profitFactor: 1.6,
      averageR: 0.2,
      expectancyR: 0.2,
      netReturnPercent: 4,
      maxEquityDrawdownPercent: 3,
    } as BacktestRunArtifact["analytics"],
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true })
    )
  );
});

describe("JsonFileBacktestRunStore metadata", () => {
  it("persists normalized labels/tags without altering analytics", async () => {
    const store = await makeStore();
    await store.save(artifact());

    const updated = await store.updateMetadata(
      "backtest-metadata-test-abc123",
      {
        label: "  EURUSD Baseline  ",
        tags: ["MT5", "baseline", "mt5", " conservative "],
      }
    );

    expect(updated?.metadata?.label).toBe("EURUSD Baseline");
    expect(updated?.metadata?.tags).toEqual([
      "mt5",
      "baseline",
      "conservative",
    ]);
    expect(updated?.analytics.sampleSize).toBe(20);

    const list = await store.list();
    expect(list[0]).toMatchObject({
      label: "EURUSD Baseline",
      tags: ["mt5", "baseline", "conservative"],
      winRate: 55,
      profitFactor: 1.6,
      averageR: 0.2,
      riskPercent: 0.5,
      assumedSpreadPips: 1,
      intrabarConflictPolicy: "STOP_FIRST",
    });
  });

  it("rejects excessive organizational tags", async () => {
    const store = await makeStore();
    await store.save(artifact());

    await expect(
      store.updateMetadata("backtest-metadata-test-abc123", {
        tags: Array.from({ length: 9 }, (_, index) => "tag-" + index),
      })
    ).rejects.toThrow(/at most 8 tags/);
  });
});
