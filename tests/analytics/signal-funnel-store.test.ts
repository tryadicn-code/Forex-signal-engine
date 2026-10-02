import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SIGNAL_FUNNEL_MAX_RETENTION_MS,
  type SignalFunnelObservation,
} from "@/analytics/signal-funnel";
import { JsonFileSignalFunnelStore } from "@/analytics/store";

const dirs: string[] = [];
const T0 = Date.UTC(2026, 9, 2, 6, 0, 0);

function observation(
  symbol: string,
  observedAt: number,
  rejectionCode: string | null = "SETUP_NONE"
): SignalFunnelObservation {
  const executed = rejectionCode === null;
  return {
    symbol,
    observedAt,
    strategyId: null,
    regime: "TREND_UP",
    biasDirection: "LONG",
    setupState: executed ? "SETUP" : "NONE",
    triggerState: executed ? "CONFIRMED" : null,
    executionDecision: executed ? "EXECUTE" : null,
    passedStages: executed
      ? [
          "SCANNED",
          "DATA_VALID",
          "BIAS_DIRECTIONAL",
          "SETUP_ACTIONABLE",
          "TRIGGER_CONFIRMED",
          "RISK_APPROVED",
          "NO_HARD_VETO",
          "EXECUTE",
        ]
      : ["SCANNED", "DATA_VALID", "BIAS_DIRECTIONAL"],
    deepestStage: executed ? "EXECUTE" : "BIAS_DIRECTIONAL",
    rejectionStage: executed ? null : "SETUP_ACTIONABLE",
    rejectionCode,
    rejectionDetail: executed ? null : "No setup.",
  };
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true })
    )
  );
});

describe("Phase 12 signal funnel durable store", () => {
  it("survives store recreation and deduplicates the same scan observation", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-funnel-"));
    dirs.push(dir);
    const file = path.join(dir, "signal-funnel.json");

    const first = new JsonFileSignalFunnelStore(file);
    const item = observation("EURUSD", T0);
    await first.appendMany([item], T0);
    await first.appendMany([item], T0);

    const restarted = new JsonFileSignalFunnelStore(file);
    const state = await restarted.read();

    expect(state.observations).toHaveLength(1);
    expect(state.observations[0].symbol).toBe("EURUSD");
  });

  it("keeps observations from different symbols in the same scan", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-funnel-"));
    dirs.push(dir);
    const store = new JsonFileSignalFunnelStore(
      path.join(dir, "signal-funnel.json")
    );

    await store.appendMany(
      [observation("EURUSD", T0), observation("GBPUSD", T0)],
      T0
    );

    const state = await store.read();
    expect(state.observations.map((item) => item.symbol).sort()).toEqual([
      "EURUSD",
      "GBPUSD",
    ]);
  });

  it("prunes observations older than the rolling 30-day retention boundary", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-funnel-"));
    dirs.push(dir);
    const store = new JsonFileSignalFunnelStore(
      path.join(dir, "signal-funnel.json")
    );

    const tooOld = T0 - SIGNAL_FUNNEL_MAX_RETENTION_MS - 1;
    const withinWindow = T0 - SIGNAL_FUNNEL_MAX_RETENTION_MS;

    await store.appendMany(
      [
        observation("USDJPY", tooOld),
        observation("GBPUSD", withinWindow),
        observation("EURUSD", T0),
      ],
      T0
    );

    const state = await store.read();
    expect(state.observations.map((item) => item.symbol)).toEqual([
      "GBPUSD",
      "EURUSD",
    ]);
  });
});
