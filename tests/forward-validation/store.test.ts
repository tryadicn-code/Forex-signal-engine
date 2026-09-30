import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonFileForwardValidationStore } from "@/forward-validation/store";
import type { ForwardValidationObservation } from "@/forward-validation/types";

const dirs: string[] = [];

function observation(
  id: string,
  at: number
): ForwardValidationObservation {
  return {
    id,
    observedAt: at,
    strategyVersion: "v1.0.0",
    manifestFingerprint: "abcdef1234567890",
    activationAt: 100,
    sourceReportId: "report-1",
    providerState: "CONNECTED",
    symbolsRequested: 2,
    symbolsSuccessful: 2,
    symbolsFailed: 0,
    freshness: {
      fresh: 2,
      delayed: 0,
      stale: 0,
    },
    engineExecuteCount: 1,
    lifecycleExecuteCount: 1,
    paperFilledCount: 1,
    paperRejectedCount: 0,
  };
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true })
    )
  );
});

describe("Phase 7 forward validation store", () => {
  it("deduplicates observations by deterministic id", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-forward-"));
    dirs.push(dir);
    const store = new JsonFileForwardValidationStore(
      path.join(dir, "forward.json"),
      10
    );

    await store.append(observation("same", 1));
    await store.append(observation("same", 1));

    const state = await store.read();
    expect(state.observations).toHaveLength(1);
  });

  it("keeps a bounded chronological observation history", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-forward-"));
    dirs.push(dir);
    const store = new JsonFileForwardValidationStore(
      path.join(dir, "forward.json"),
      2
    );

    await store.append(observation("a", 1));
    await store.append(observation("b", 2));
    await store.append(observation("c", 3));

    const state = await store.read();
    expect(state.observations.map((item) => item.id)).toEqual(["b", "c"]);
  });
});
