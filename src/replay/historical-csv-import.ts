import { candleCloseTime, intervalMs } from "@/market-data/timeframe";
import type {
  HistoricalCsvImportOptions,
  HistoricalCsvImportResult,
  HistoricalDatasetValidation,
  HistoricalFileSummary,
  HistoricalImportIssue,
  HistoricalSeriesCoverage,
  HistoricalTextFile,
  RequiredBacktestTimeframe,
} from "@/replay/import-types";
import { REQUIRED_BACKTEST_TIMEFRAMES } from "@/replay/import-types";
import type { ReplayDataset, ReplaySymbolData } from "@/replay/types";
import type { Timeframe } from "@/types/market";
import type { CanonicalCandle, SymbolMetadata } from "@/types/market-data";

const SUPPORTED_TIMEFRAMES = new Set<Timeframe>([
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D1",
  "W1",
  "MN",
]);

const MAX_REPORTED_ROW_ERRORS_PER_FILE = 20;

/**
 * Preferred timeframes for deriving a static conversion rate from an uploaded
 * symbol: the highest-quality (slowest) series wins so the rate is not driven
 * by a single M15 print. Static by design (F3-static): the resolver interface
 * does not accept asOf, so a per-step rate is out of scope.
 */
const CONVERSION_RATE_TIMEFRAME_PREFERENCE: readonly Timeframe[] = [
  "D1",
  "H4",
  "H1",
  "M15",
  "M30",
  "M5",
  "M1",
];

type Delimiter = "," | ";" | "\t";

interface ParsedHistoricalFile {
  summary: HistoricalFileSummary;
  candles: CanonicalCandle[];
  issues: HistoricalImportIssue[];
}

export function importHistoricalCsvFiles(
  files: HistoricalTextFile[],
  options: HistoricalCsvImportOptions
): HistoricalCsvImportResult {
  const issues: HistoricalImportIssue[] = [];
  const filesSummary: HistoricalFileSummary[] = [];

  validateOptions(options, issues);

  if (files.length === 0) {
    issues.push({
      severity: "ERROR",
      code: "NO_FILES",
      message: "At least one historical CSV/TXT file is required.",
    });
  }

  const parsed = files.map((file) =>
    parseHistoricalFile(file, options.sourceUtcOffsetMinutes)
  );

  for (const item of parsed) {
    filesSummary.push(item.summary);
    issues.push(...item.issues);
  }

  const groups = new Map<string, {
    symbol: string;
    timeframe: Timeframe;
    candles: Map<number, CanonicalCandle>;
  }>();

  for (const item of parsed) {
    const { symbol, timeframe } = item.summary;
    if (!symbol || !timeframe) continue;

    const key = symbol + ":" + timeframe;
    let group = groups.get(key);
    if (!group) {
      group = {
        symbol,
        timeframe,
        candles: new Map<number, CanonicalCandle>(),
      };
      groups.set(key, group);
    }

    for (const candle of item.candles) {
      const existing = group.candles.get(candle.timestamp);
      if (!existing) {
        group.candles.set(candle.timestamp, candle);
        continue;
      }

      if (sameCandle(existing, candle)) {
        item.summary.duplicateRows += 1;
        issues.push({
          severity: "WARNING",
          code: "IDENTICAL_DUPLICATE_DEDUPED",
          message:
            "Identical duplicate candle was de-duplicated at " +
            new Date(candle.timestamp).toISOString() +
            ".",
          fileName: item.summary.fileName,
          symbol,
          timeframe,
        });
        continue;
      }

      issues.push({
        severity: "ERROR",
        code: "CONFLICTING_DUPLICATE_CANDLE",
        message:
          "Conflicting candles share timestamp " +
          new Date(candle.timestamp).toISOString() +
          ".",
        fileName: item.summary.fileName,
        symbol,
        timeframe,
      });
    }
  }

  const symbols: ReplayDataset["symbols"] = {};
  const coverage: HistoricalSeriesCoverage[] = [];

  const symbolCodes = [...new Set([...groups.values()].map((group) => group.symbol))].sort();

  // Primary = has ALL required TFs -> enters the backtest.
  // Auxiliary = missing >=1 required TF -> used only as a conversion-rate source.
  const primarySymbols: string[] = [];
  const auxiliarySymbols: string[] = [];
  const conversionRates: Record<string, number> = {};

  for (const symbol of symbolCodes) {
    const symbolGroups = [...groups.values()].filter(
      (group) => group.symbol === symbol
    );

    const candles: ReplaySymbolData["candles"] = {};
    for (const group of symbolGroups) {
      const values = [...group.candles.values()].sort(
        (a, b) => a.timestamp - b.timestamp
      );
      if (values.length === 0) continue;
      candles[group.timeframe] = values;
      coverage.push(seriesCoverage(symbol, group.timeframe, values));
    }

    const missing = REQUIRED_BACKTEST_TIMEFRAMES.filter(
      (timeframe) => !candles[timeframe]
    );

    if (missing.length === 0) {
      primarySymbols.push(symbol);
      symbols[symbol] = {
        metadata: inferFxMetadata(symbol),
        spreadPips: options.assumedSpreadPips,
        candles,
      };
      issues.push({
        severity: "WARNING",
        code: "SYMBOL_METADATA_INFERRED",
        message:
          "FX metadata for " +
          symbol +
          " was inferred from its six-letter symbol code. Verify pip size and broker lot constraints before relying on sizing results.",
        symbol,
      });
    } else {
      for (const timeframe of missing) {
        issues.push({
          severity: "WARNING",
          code: "REQUIRED_TIMEFRAME_MISSING",
          message:
            symbol +
            " is missing required timeframe " +
            timeframe +
            " (required: D1, H4, H1, M15).",
          symbol,
          timeframe,
        });
      }
      auxiliarySymbols.push(symbol);
      issues.push({
        severity: "WARNING",
        code: "SYMBOL_TREATED_AS_AUXILIARY",
        message:
          symbol +
          " lacks required timeframe(s) " +
          missing.join(", ") +
          " and will be used only as a conversion-rate source (not backtested).",
        symbol,
      });
    }

    for (const tf of CONVERSION_RATE_TIMEFRAME_PREFERENCE) {
      const series = candles[tf];
      if (!series || series.length === 0) continue;
      const last = series[series.length - 1];
      conversionRates[symbol] = last.close;
      issues.push({
        severity: "INFO",
        code: "CONVERSION_RATE_DERIVED",
        message:
          symbol +
          " = " +
          last.close +
          " (from " +
          tf +
          " close at " +
          new Date(last.timestamp).toISOString() +
          ").",
        symbol,
        timeframe: tf,
      });
      break;
    }
  }

  if (primarySymbols.length === 0) {
    issues.push({
      severity: "ERROR",
      code: "NO_PRIMARY_SYMBOL",
      message:
        "No symbol has the full required timeframe set (D1, H4, H1, M15). Backtest cannot run.",
    });
  }

  if (Object.keys(conversionRates).length === 0) {
    issues.push({
      severity: "INFO",
      code: "NO_CONVERSION_RATE_SYMBOL",
      message:
        "No conversion-rate symbol was derived. If the backtested symbol's quote currency differs from the account currency (e.g. AUDCAD on a USD account), upload its quote-vs-account pair (e.g. USDCAD) alongside it.",
    });
  }

  const requiredCoverage = coverage.filter(
    (item) =>
      primarySymbols.includes(item.symbol) &&
      REQUIRED_BACKTEST_TIMEFRAMES.includes(
        item.timeframe as RequiredBacktestTimeframe
      )
  );

  const commonStartAt =
    requiredCoverage.length > 0 &&
    requiredCoverage.length ===
      primarySymbols.length * REQUIRED_BACKTEST_TIMEFRAMES.length
      ? Math.max(...requiredCoverage.map((item) => item.startAt))
      : null;
  const commonEndAt =
    requiredCoverage.length > 0 &&
    requiredCoverage.length ===
      primarySymbols.length * REQUIRED_BACKTEST_TIMEFRAMES.length
      ? Math.min(...requiredCoverage.map((item) => item.endAt))
      : null;

  if (
    commonStartAt !== null &&
    commonEndAt !== null &&
    commonStartAt > commonEndAt
  ) {
    issues.push({
      severity: "ERROR",
      code: "NO_COMMON_COVERAGE_WINDOW",
      message:
        "Required D1/H4/H1/M15 series do not overlap in one usable historical window.",
    });
  }

  const estimatedM15Steps =
    commonStartAt !== null &&
    commonEndAt !== null &&
    commonEndAt >= commonStartAt
      ? Math.floor((commonEndAt - commonStartAt) / intervalMs("M15")) + 1
      : null;

  for (const item of coverage) {
    if (item.nonWeekendGapCount > 0) {
      issues.push({
        severity: "INFO",
        code: "SERIES_GAPS_DETECTED",
        message:
          item.symbol +
          " " +
          item.timeframe +
          " contains " +
          item.nonWeekendGapCount +
          " non-weekend gap(s); largest gap " +
          Math.round(item.largestGapMs / 60_000) +
          " minutes.",
        symbol: item.symbol,
        timeframe: item.timeframe,
      });
    }
  }

  const source = options.source?.trim() || "Uploaded historical CSV/TXT";
  const validation: HistoricalDatasetValidation = {
    valid: !issues.some((issue) => issue.severity === "ERROR"),
    datasetId: options.datasetId.trim(),
    source,
    sourceUtcOffsetMinutes: options.sourceUtcOffsetMinutes,
    assumedSpreadPips: options.assumedSpreadPips,
    importedFileCount: files.length,
    importedSymbolCount: symbolCodes.length,
    importedSeriesCount: coverage.length,
    files: filesSummary,
    series: coverage.sort(
      (a, b) =>
        a.symbol.localeCompare(b.symbol) ||
        REQUIRED_BACKTEST_TIMEFRAMES.indexOf(
          a.timeframe as RequiredBacktestTimeframe
        ) -
          REQUIRED_BACKTEST_TIMEFRAMES.indexOf(
            b.timeframe as RequiredBacktestTimeframe
          )
    ),
    symbols: primarySymbols,
    ...(auxiliarySymbols.length > 0 ? { auxiliarySymbols } : {}),
    commonStartAt,
    commonEndAt,
    estimatedM15Steps,
    issues,
  };

  if (!validation.valid || primarySymbols.length === 0) {
    return { dataset: null, validation };
  }

  return {
    dataset: {
      id: validation.datasetId,
      source,
      symbols,
      ...(Object.keys(conversionRates).length > 0 ? { conversionRates } : {}),
    },
    validation,
  };
}

function parseHistoricalFile(
  file: HistoricalTextFile,
  sourceUtcOffsetMinutes: number
): ParsedHistoricalFile {
  const issues: HistoricalImportIssue[] = [];
  const identity = inferFileIdentity(file.name);
  const lines = file.text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const delimiter = detectDelimiter(lines[0] ?? "");
  const summary: HistoricalFileSummary = {
    fileName: file.name,
    symbol: identity.symbol,
    timeframe: identity.timeframe,
    delimiter: delimiterName(delimiter),
    rowCount: Math.max(0, lines.length - 1),
    importedRows: 0,
    duplicateRows: 0,
    startAt: null,
    endAt: null,
  };

  if (!identity.symbol || !identity.timeframe) {
    issues.push({
      severity: "ERROR",
      code: "FILE_IDENTITY_UNRESOLVED",
      message:
        "File name must contain a six-letter FX symbol and timeframe, e.g. EURUSD_M15.csv.",
      fileName: file.name,
    });
    return { summary, candles: [], issues };
  }

  if (lines.length === 0) {
    issues.push({
      severity: "ERROR",
      code: "EMPTY_FILE",
      message: "Historical file is empty.",
      fileName: file.name,
      symbol: identity.symbol,
      timeframe: identity.timeframe,
    });
    return { summary, candles: [], issues };
  }

  const firstCells = parseDelimitedRow(lines[0], delimiter);
  const hasHeader = looksLikeHeader(firstCells);
  const header = hasHeader
    ? firstCells.map(normalizeHeader)
    : defaultPositionalHeader(firstCells.length);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  summary.rowCount = dataLines.length;

  const columns = resolveColumns(header);
  if (!columns.valid) {
    issues.push({
      severity: "ERROR",
      code: "REQUIRED_COLUMNS_MISSING",
      message:
        "Required columns are missing. Expected DATE+TIME or DATETIME/TIMESTAMP plus OPEN,HIGH,LOW,CLOSE.",
      fileName: file.name,
      symbol: identity.symbol,
      timeframe: identity.timeframe,
    });
    return { summary, candles: [], issues };
  }

  const candles: CanonicalCandle[] = [];
  let reportedErrors = 0;

  for (let index = 0; index < dataLines.length; index += 1) {
    const lineNumber = index + (hasHeader ? 2 : 1);
    const cells = parseDelimitedRow(dataLines[index], delimiter);

    try {
      const timestamp = parseRowTimestamp(
        cells,
        columns,
        sourceUtcOffsetMinutes
      );
      const open = numericCell(cells, columns.open, delimiter);
      const high = numericCell(cells, columns.high, delimiter);
      const low = numericCell(cells, columns.low, delimiter);
      const close = numericCell(cells, columns.close, delimiter);
      const volume =
        columns.volume === null
          ? 0
          : numericCell(cells, columns.volume, delimiter, true);

      validateOhlc({ open, high, low, close, volume });

      candles.push({
        symbol: identity.symbol,
        timeframe: identity.timeframe,
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        source: "historical-import:" + file.name,
        closed: true,
      });
    } catch (error) {
      if (reportedErrors < MAX_REPORTED_ROW_ERRORS_PER_FILE) {
        issues.push({
          severity: "ERROR",
          code: "INVALID_CSV_ROW",
          message:
            "Line " +
            lineNumber +
            ": " +
            (error instanceof Error ? error.message : String(error)),
          fileName: file.name,
          line: lineNumber,
          symbol: identity.symbol,
          timeframe: identity.timeframe,
        });
      }
      reportedErrors += 1;
    }
  }

  if (reportedErrors > MAX_REPORTED_ROW_ERRORS_PER_FILE) {
    issues.push({
      severity: "ERROR",
      code: "ADDITIONAL_INVALID_ROWS",
      message:
        String(reportedErrors - MAX_REPORTED_ROW_ERRORS_PER_FILE) +
        " additional invalid row(s) were suppressed from the report.",
      fileName: file.name,
      symbol: identity.symbol,
      timeframe: identity.timeframe,
    });
  }

  candles.sort((a, b) => a.timestamp - b.timestamp);
  summary.importedRows = candles.length;
  summary.startAt = candles[0]?.timestamp ?? null;
  summary.endAt =
    candles.length > 0
      ? candleCloseTime(identity.timeframe, candles[candles.length - 1].timestamp)
      : null;

  if (candles.length === 0 && reportedErrors === 0) {
    issues.push({
      severity: "ERROR",
      code: "NO_DATA_ROWS",
      message: "No historical candle rows were found.",
      fileName: file.name,
      symbol: identity.symbol,
      timeframe: identity.timeframe,
    });
  }

  return { summary, candles, issues };
}

function inferFileIdentity(fileName: string): {
  symbol: string | null;
  timeframe: Timeframe | null;
} {
  const upper = fileName.toUpperCase();
  const symbolMatch = upper.match(/(?:^|[^A-Z])([A-Z]{6})(?=[^A-Z]|$)/);
  const timeframeMatch = upper.match(
    /(?:^|[^A-Z0-9])(M1|M5|M15|M30|H1|H4|D1|W1|MN)(?=[^A-Z0-9]|$)/
  );

  const timeframe =
    timeframeMatch && SUPPORTED_TIMEFRAMES.has(timeframeMatch[1] as Timeframe)
      ? (timeframeMatch[1] as Timeframe)
      : null;

  return {
    symbol: symbolMatch?.[1] ?? null,
    timeframe,
  };
}

function detectDelimiter(firstLine: string): Delimiter {
  const candidates: Delimiter[] = ["\t", ";", ","];
  let best: Delimiter = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function delimiterName(
  delimiter: Delimiter
): "comma" | "semicolon" | "tab" {
  if (delimiter === "\t") return "tab";
  if (delimiter === ";") return "semicolon";
  return "comma";
}

function parseDelimitedRow(line: string, delimiter: Delimiter): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function looksLikeHeader(cells: string[]): boolean {
  const normalized = cells.map(normalizeHeader);
  return normalized.some((value) =>
    [
      "date",
      "time",
      "datetime",
      "timestamp",
      "open",
      "high",
      "low",
      "close",
    ].includes(value)
  );
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/^["'<]+|[>"']+$/g, "")
    .replace(/[\s_\-]/g, "")
    .toLowerCase();
}

function defaultPositionalHeader(columnCount: number): string[] {
  if (columnCount >= 6) {
    return [
      "date",
      "time",
      "open",
      "high",
      "low",
      "close",
      "tickvol",
      "vol",
      "spread",
    ].slice(0, columnCount);
  }
  return [];
}

function resolveColumns(header: string[]): {
  valid: boolean;
  date: number | null;
  time: number | null;
  datetime: number | null;
  timestamp: number | null;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
} {
  const find = (...names: string[]): number | null => {
    const index = header.findIndex((value) => names.includes(value));
    return index >= 0 ? index : null;
  };

  const date = find("date");
  const time = find("time");
  const datetime = find("datetime", "dateandtime");
  const timestamp = find("timestamp", "epochtime", "epoch");
  const open = find("open");
  const high = find("high");
  const low = find("low");
  const close = find("close");
  const volume = find("tickvol", "tickvolume", "volume", "vol");

  const hasTime =
    timestamp !== null ||
    datetime !== null ||
    (date !== null && time !== null);

  return {
    valid:
      hasTime &&
      open !== null &&
      high !== null &&
      low !== null &&
      close !== null,
    date,
    time,
    datetime,
    timestamp,
    open: open ?? -1,
    high: high ?? -1,
    low: low ?? -1,
    close: close ?? -1,
    volume,
  };
}

function parseRowTimestamp(
  cells: string[],
  columns: ReturnType<typeof resolveColumns>,
  sourceUtcOffsetMinutes: number
): number {
  if (columns.timestamp !== null) {
    const raw = cells[columns.timestamp]?.trim();
    if (!raw) throw new Error("Missing timestamp.");
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      if (numeric > 10_000_000_000) return Math.trunc(numeric);
      if (numeric > 1_000_000_000) return Math.trunc(numeric * 1000);
    }
    return parseDateTime(raw, sourceUtcOffsetMinutes);
  }

  if (columns.datetime !== null) {
    const raw = cells[columns.datetime]?.trim();
    if (!raw) throw new Error("Missing datetime.");
    return parseDateTime(raw, sourceUtcOffsetMinutes);
  }

  const date = columns.date === null ? "" : cells[columns.date]?.trim();
  const time = columns.time === null ? "" : cells[columns.time]?.trim();
  if (!date || !time) throw new Error("Missing DATE/TIME.");
  return parseDateTime(date + " " + time, sourceUtcOffsetMinutes);
}

function parseDateTime(
  raw: string,
  sourceUtcOffsetMinutes: number
): number {
  const trimmed = raw.trim();

  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    const parsed = Date.parse(trimmed.replace(/\./g, "-"));
    if (!Number.isFinite(parsed)) {
      throw new Error("Invalid timezone-aware datetime: " + raw);
    }
    return parsed;
  }

  const match = trimmed.match(
    /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) {
    throw new Error(
      "Unsupported datetime '" +
        raw +
        "'. Expected YYYY.MM.DD HH:mm[:ss] or ISO timestamp."
    );
  }

  const [, year, month, day, hour, minute, second = "0"] = match;
  const utc =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ) -
    sourceUtcOffsetMinutes * 60_000;

  if (!Number.isFinite(utc)) {
    throw new Error("Invalid datetime: " + raw);
  }
  return utc;
}

function numericCell(
  cells: string[],
  index: number,
  delimiter: Delimiter,
  allowEmpty = false
): number {
  const raw = cells[index]?.trim() ?? "";
  if (allowEmpty && raw === "") return 0;
  const normalized =
    delimiter === "," ? raw : raw.replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error("Invalid numeric value '" + raw + "'.");
  }
  return value;
}

function validateOhlc(input: {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}): void {
  const { open, high, low, close, volume } = input;
  if ([open, high, low, close].some((value) => value <= 0)) {
    throw new Error("OHLC values must be positive.");
  }
  if (high < low) throw new Error("HIGH is below LOW.");
  if (high < Math.max(open, close)) {
    throw new Error("HIGH is below OPEN/CLOSE.");
  }
  if (low > Math.min(open, close)) {
    throw new Error("LOW is above OPEN/CLOSE.");
  }
  if (!Number.isFinite(volume) || volume < 0) {
    throw new Error("Volume must be finite and non-negative.");
  }
}

function sameCandle(a: CanonicalCandle, b: CanonicalCandle): boolean {
  return (
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume
  );
}

function inferFxMetadata(symbol: string): SymbolMetadata {
  if (!/^[A-Z]{6}$/.test(symbol)) {
    throw new Error("Historical backtest currently supports six-letter FX symbols only.");
  }
  const baseCurrency = symbol.slice(0, 3);
  const quoteCurrency = symbol.slice(3, 6);
  const jpy = quoteCurrency === "JPY";
  return {
    symbol,
    baseCurrency,
    quoteCurrency,
    pipSize: jpy ? 0.01 : 0.0001,
    pricePrecision: jpy ? 3 : 5,
    contractSize: 100_000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
  };
}

function seriesCoverage(
  symbol: string,
  timeframe: Timeframe,
  candles: CanonicalCandle[]
): HistoricalSeriesCoverage {
  const expected = intervalMs(timeframe);
  let nonWeekendGapCount = 0;
  let largestGapMs = 0;

  for (let index = 1; index < candles.length; index += 1) {
    const gap = candles[index].timestamp - candles[index - 1].timestamp;
    largestGapMs = Math.max(largestGapMs, gap);
    if (gap > expected * 1.5 && !looksLikeWeekendGap(candles[index - 1].timestamp, candles[index].timestamp)) {
      nonWeekendGapCount += 1;
    }
  }

  return {
    symbol,
    timeframe,
    candleCount: candles.length,
    startAt: candleCloseTime(timeframe, candles[0].timestamp),
    endAt: candleCloseTime(timeframe, candles[candles.length - 1].timestamp),
    nonWeekendGapCount,
    largestGapMs,
  };
}

function looksLikeWeekendGap(previousOpen: number, nextOpen: number): boolean {
  const previous = new Date(previousOpen);
  const next = new Date(nextOpen);
  const prevDay = previous.getUTCDay();
  const nextDay = next.getUTCDay();
  const gap = nextOpen - previousOpen;
  return (
    gap <= 4 * 24 * 60 * 60_000 &&
    (prevDay === 5 || prevDay === 6 || prevDay === 0 || nextDay === 0 || nextDay === 1)
  );
}

function validateOptions(
  options: HistoricalCsvImportOptions,
  issues: HistoricalImportIssue[]
): void {
  if (!options.datasetId.trim()) {
    issues.push({
      severity: "ERROR",
      code: "DATASET_ID_REQUIRED",
      message: "Dataset id/name is required.",
    });
  }
  if (
    !Number.isFinite(options.sourceUtcOffsetMinutes) ||
    options.sourceUtcOffsetMinutes < -14 * 60 ||
    options.sourceUtcOffsetMinutes > 14 * 60
  ) {
    issues.push({
      severity: "ERROR",
      code: "UTC_OFFSET_INVALID",
      message: "Source UTC offset must be between -840 and +840 minutes.",
    });
  }
  if (
    !Number.isFinite(options.assumedSpreadPips) ||
    options.assumedSpreadPips < 0
  ) {
    issues.push({
      severity: "ERROR",
      code: "SPREAD_INVALID",
      message: "Assumed spread must be a finite non-negative number of pips.",
    });
  }
}
