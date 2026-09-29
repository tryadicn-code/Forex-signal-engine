import { describe, expect, it } from "vitest";
import { importHistoricalCsvFiles } from "@/replay/historical-csv-import";
import type { HistoricalTextFile } from "@/replay/import-types";

function mt5File(
  name: string,
  rows: string[]
): HistoricalTextFile {
  return {
    name,
    text:
      "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\n" +
      rows.join("\n"),
  };
}

describe("historical CSV import", () => {
  it("converts MT5 broker time using the explicit source UTC offset", () => {
    const files = [
      mt5File("EURUSD_D1.csv", [
        "2026.01.01\t02:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
      ]),
      mt5File("EURUSD_H4.csv", [
        "2026.01.01\t22:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
      ]),
      mt5File("EURUSD_H1.csv", [
        "2026.01.02\t01:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
      ]),
      mt5File("EURUSD_M15.csv", [
        "2026.01.02\t01:45:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
      ]),
    ];

    const imported = importHistoricalCsvFiles(files, {
      datasetId: "offset-test",
      source: "MT5",
      sourceUtcOffsetMinutes: 120,
      assumedSpreadPips: 1,
    });

    expect(imported.dataset).not.toBeNull();
    expect(imported.validation.valid).toBe(true);
    expect(
      imported.dataset?.symbols.EURUSD.candles.D1?.[0].timestamp
    ).toBe(Date.UTC(2026, 0, 1, 0, 0, 0));
  });

  it("fails closed when a required timeframe is missing", () => {
    const imported = importHistoricalCsvFiles(
      [
        mt5File("EURUSD_D1.csv", [
          "2026.01.01\t00:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
        ]),
      ],
      {
        datasetId: "missing-timeframes",
        sourceUtcOffsetMinutes: 0,
        assumedSpreadPips: 1,
      }
    );

    expect(imported.dataset).toBeNull();
    expect(imported.validation.valid).toBe(false);
    expect(
      imported.validation.issues.filter(
        (issue) => issue.code === "REQUIRED_TIMEFRAME_MISSING"
      )
    ).toHaveLength(3);
  });

  it("deduplicates identical overlapping candles with an explicit warning", () => {
    const m15Row =
      "2026.01.01\t23:45:00\t1.1000\t1.1100\t1.0900\t1.1050\t100";
    const imported = importHistoricalCsvFiles(
      [
        mt5File("EURUSD_M15_part1.csv", [m15Row]),
        mt5File("EURUSD_M15_part2.csv", [m15Row]),
        mt5File("EURUSD_D1.csv", [
          "2026.01.01\t00:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
        ]),
        mt5File("EURUSD_H4.csv", [
          "2026.01.01\t20:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
        ]),
        mt5File("EURUSD_H1.csv", [
          "2026.01.01\t23:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
        ]),
      ],
      {
        datasetId: "dedupe-test",
        sourceUtcOffsetMinutes: 0,
        assumedSpreadPips: 1,
      }
    );

    expect(
      imported.validation.issues.some(
        (issue) => issue.code === "IDENTICAL_DUPLICATE_DEDUPED"
      )
    ).toBe(true);
    expect(imported.dataset?.symbols.EURUSD.candles.M15).toHaveLength(1);
  });

  it("blocks conflicting candles with the same timestamp", () => {
    const imported = importHistoricalCsvFiles(
      [
        mt5File("EURUSD_M15_part1.csv", [
          "2026.01.02\t00:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
        ]),
        mt5File("EURUSD_M15_part2.csv", [
          "2026.01.02\t00:00:00\t1.1000\t1.1200\t1.0900\t1.1150\t100",
        ]),
        mt5File("EURUSD_D1.csv", [
          "2026.01.02\t00:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
        ]),
        mt5File("EURUSD_H4.csv", [
          "2026.01.02\t00:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
        ]),
        mt5File("EURUSD_H1.csv", [
          "2026.01.02\t00:00:00\t1.1000\t1.1100\t1.0900\t1.1050\t100",
        ]),
      ],
      {
        datasetId: "conflict-test",
        sourceUtcOffsetMinutes: 0,
        assumedSpreadPips: 1,
      }
    );

    expect(imported.validation.valid).toBe(false);
    expect(imported.dataset).toBeNull();
    expect(
      imported.validation.issues.some(
        (issue) => issue.code === "CONFLICTING_DUPLICATE_CANDLE"
      )
    ).toBe(true);
  });

  it("accepts standard comma CSV with epoch timestamps", () => {
    const csv = (name: string, timestamp: number): HistoricalTextFile => ({
      name,
      text:
        "timestamp,open,high,low,close,volume\n" +
        timestamp +
        ",1.1000,1.1100,1.0900,1.1050,100",
    });
    const t = Date.UTC(2026, 0, 2, 0, 0, 0);
    const imported = importHistoricalCsvFiles(
      [
        csv("EURUSD_D1.csv", t - 24 * 60 * 60_000),
        csv("EURUSD_H4.csv", t - 4 * 60 * 60_000),
        csv("EURUSD_H1.csv", t - 60 * 60_000),
        csv("EURUSD_M15.csv", t - 15 * 60_000),
      ],
      {
        datasetId: "standard-csv",
        sourceUtcOffsetMinutes: 0,
        assumedSpreadPips: 0.8,
      }
    );

    expect(imported.validation.valid).toBe(true);
    expect(imported.validation.commonStartAt).toBe(t);
    expect(imported.validation.commonEndAt).toBe(t);
  });
});
