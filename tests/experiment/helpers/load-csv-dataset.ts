import fs from "node:fs";
import path from "node:path";
import { importHistoricalCsvFiles } from "@/replay/historical-csv-import";
import type {
  HistoricalDatasetValidation,
  HistoricalTextFile,
} from "@/replay/import-types";
import type { ReplayDataset } from "@/replay/types";

const TIMEFRAMES = ["D1", "H4", "H1", "M15"] as const;

export interface LoadedDataset {
  dataset: ReplayDataset;
  validation: HistoricalDatasetValidation;
  files: HistoricalTextFile[];
}

export function loadCsvDataset(options: {
  dir: string;
  symbols: string[];
  auxiliarySymbols?: string[];
  sourceUtcOffsetMinutes: number;
  assumedSpreadPips: number;
  datasetId: string;
}): LoadedDataset {
  const files: HistoricalTextFile[] = [];
  const readFile = (name: string): void => {
    const fullPath = path.join(options.dir, name);
    if (!fs.existsSync(fullPath)) {
      throw new Error("Missing CSV file: " + fullPath);
    }
    files.push({ name, text: fs.readFileSync(fullPath, "utf8") });
  };

  for (const symbol of options.symbols) {
    for (const tf of TIMEFRAMES) {
      readFile(symbol + "_" + tf + ".csv");
    }
  }
  for (const symbol of options.auxiliarySymbols ?? []) {
    readFile(symbol + "_D1.csv");
  }

  const imported = importHistoricalCsvFiles(files, {
    datasetId: options.datasetId,
    source: "MT5 export: " + options.symbols.join(", "),
    sourceUtcOffsetMinutes: options.sourceUtcOffsetMinutes,
    assumedSpreadPips: options.assumedSpreadPips,
  });

  if (!imported.dataset || !imported.validation.valid) {
    const errors = imported.validation.issues.filter(
      (issue) => issue.severity === "ERROR"
    );
    const detail = errors
      .map((issue) => "  [" + issue.code + "] " + issue.message)
      .join("\n");
    throw new Error("CSV import failed:\n" + detail);
  }

  return {
    dataset: imported.dataset,
    validation: imported.validation,
    files,
  };
}