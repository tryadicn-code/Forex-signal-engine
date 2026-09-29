import { describe, expect, it } from "vitest";
import { runImportedBacktest } from "@/replay/imported-backtest-runner";
import type { HistoricalTextFile } from "@/replay/import-types";
import type { Timeframe } from "@/types/market";
import { intervalMs } from "@/market-data/timeframe";

const END = Date.UTC(2026, 5, 1, 0, 0, 0);

function historyFile(timeframe: Timeframe, count = 80): HistoricalTextFile {
  const step = intervalMs(timeframe);
  const firstOpen = END - count * step;
  const rows: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const timestamp = firstOpen + index * step;
    const base = 1.08 + index * 0.0001;
    rows.push(
      [
        timestamp,
        base.toFixed(5),
        (base + 0.0005).toFixed(5),
        (base - 0.0004).toFixed(5),
        (base + 0.0002).toFixed(5),
        100 + index,
      ].join(",")
    );
  }

  return {
    name: "EURUSD_" + timeframe + ".csv",
    text:
      "timestamp,open,high,low,close,volume\n" + rows.join("\n"),
  };
}

describe("runImportedBacktest", () => {
  it("runs validated uploads through replay, execution and analytics", async () => {
    const artifact = await runImportedBacktest(
      [
        historyFile("D1"),
        historyFile("H4"),
        historyFile("H1"),
        historyFile("M15"),
      ],
      {
        datasetId: "orchestrator-test",
        source: "synthetic CSV",
        sourceUtcOffsetMinutes: 0,
        assumedSpreadPips: 1,
        startAt: END - 15 * 60_000,
        endAt: END,
        initialBalance: 10_000,
        riskPercent: 0.5,
        intrabarConflictPolicy: "STOP_FIRST",
        maxOpenPositions: 10,
        maxTotalOpenRiskPercent: 5,
      }
    );

    expect(artifact.validation.valid).toBe(true);
    expect(artifact.validation.symbols).toEqual(["EURUSD"]);
    expect(artifact.execution.enabled).toBe(true);
    expect(artifact.analytics.sampleSize).toBe(
      artifact.execution.closedTradeCount
    );
    expect(artifact.config.startAt).toBe(END - 15 * 60_000);
    expect(artifact.config.endAt).toBe(END);
  });

  it("blocks oversized synchronous replay windows before scanning", async () => {
    await expect(
      runImportedBacktest(
        [
          historyFile("D1"),
          historyFile("H4"),
          historyFile("H1"),
          historyFile("M15"),
        ],
        {
          datasetId: "limit-test",
          source: "synthetic CSV",
          sourceUtcOffsetMinutes: 0,
          assumedSpreadPips: 1,
          initialBalance: 10_000,
          riskPercent: 0.5,
          intrabarConflictPolicy: "STOP_FIRST",
          maxOpenPositions: 10,
          maxTotalOpenRiskPercent: 5,
          maxReplaySteps: 1,
        }
      )
    ).rejects.toMatchObject({
      name: "BacktestValidationError",
    });
  });
});
