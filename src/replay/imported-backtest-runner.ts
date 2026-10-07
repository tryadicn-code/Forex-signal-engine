import { intervalMs } from "@/market-data/timeframe";
import { HistoricalReplayRunner } from "@/replay/historical-replay-runner";
import { importHistoricalCsvFiles } from "@/replay/historical-csv-import";
import type {
  HistoricalCsvImportOptions,
  HistoricalDatasetValidation,
  HistoricalImportIssue,
  HistoricalTextFile,
} from "@/replay/import-types";
import {
  BacktestValidationError,
  type BacktestRunArtifact,
  type BacktestRunConfig,
  type ResolvedBacktestRunConfig,
} from "@/replay/backtest-run-types";

export const DEFAULT_MAX_SYNCHRONOUS_REPLAY_STEPS = 50_000;

export type RunImportedBacktestOptions = {
  onProgress?: (completedSteps: number, totalSteps: number) => void;
  signal?: AbortSignal;
};

export async function runImportedBacktest(
  files: HistoricalTextFile[],
  config: BacktestRunConfig,
  options?: RunImportedBacktestOptions
): Promise<BacktestRunArtifact> {
  const startedWallClock = Date.now();
  const importOptions: HistoricalCsvImportOptions = {
    datasetId: config.datasetId,
    source: config.source,
    sourceUtcOffsetMinutes: config.sourceUtcOffsetMinutes,
    assumedSpreadPips: config.assumedSpreadPips,
  };
  const imported = importHistoricalCsvFiles(files, importOptions);

  if (!imported.dataset || !imported.validation.valid) {
    throw new BacktestValidationError(
      "Historical dataset validation failed.",
      imported.validation
    );
  }

  const validationIssues: HistoricalImportIssue[] = [];
  validateRunNumbers(config, validationIssues);

  const coverageStart = imported.validation.commonStartAt;
  const coverageEnd = imported.validation.commonEndAt;
  if (coverageStart === null || coverageEnd === null) {
    validationIssues.push({
      severity: "ERROR",
      code: "COMMON_COVERAGE_UNAVAILABLE",
      message: "A common D1/H4/H1/M15 historical coverage window is required.",
    });
  }

  const startAt = config.startAt ?? coverageStart ?? 0;
  const endAt = config.endAt ?? coverageEnd ?? 0;
  const maxReplaySteps =
    config.maxReplaySteps ?? DEFAULT_MAX_SYNCHRONOUS_REPLAY_STEPS;

  if (
    coverageStart !== null &&
    coverageEnd !== null &&
    (startAt < coverageStart || startAt > coverageEnd)
  ) {
    validationIssues.push({
      severity: "ERROR",
      code: "START_OUTSIDE_COMMON_COVERAGE",
      message:
        "Requested start is outside common dataset coverage (" +
        new Date(coverageStart).toISOString() +
        " to " +
        new Date(coverageEnd).toISOString() +
        ").",
    });
  }

  if (
    coverageStart !== null &&
    coverageEnd !== null &&
    (endAt < coverageStart || endAt > coverageEnd)
  ) {
    validationIssues.push({
      severity: "ERROR",
      code: "END_OUTSIDE_COMMON_COVERAGE",
      message:
        "Requested end is outside common dataset coverage (" +
        new Date(coverageStart).toISOString() +
        " to " +
        new Date(coverageEnd).toISOString() +
        ").",
    });
  }

  if (endAt <= startAt) {
    validationIssues.push({
      severity: "ERROR",
      code: "BACKTEST_WINDOW_INVALID",
      message: "Backtest end must be later than start.",
    });
  }

  const stepEstimate =
    endAt > startAt
      ? Math.floor((endAt - startAt) / intervalMs("M15")) + 1
      : 0;

  if (!Number.isInteger(maxReplaySteps) || maxReplaySteps <= 0) {
    validationIssues.push({
      severity: "ERROR",
      code: "REPLAY_STEP_LIMIT_INVALID",
      message: "maxReplaySteps must be a positive integer.",
    });
  } else if (stepEstimate > maxReplaySteps) {
    validationIssues.push({
      severity: "ERROR",
      code: "REPLAY_STEP_LIMIT_EXCEEDED",
      message:
        "Requested window is approximately " +
        stepEstimate.toLocaleString("en-US") +
        " M15 replay steps, above the synchronous safety limit of " +
        maxReplaySteps.toLocaleString("en-US") +
        ". Narrow the date range before running.",
    });
  }

  const validation = withAdditionalIssues(
    imported.validation,
    validationIssues,
    stepEstimate
  );
  if (!validation.valid) {
    throw new BacktestValidationError(
      "Backtest run configuration failed validation.",
      validation
    );
  }

  const resolved: ResolvedBacktestRunConfig = {
    datasetId: config.datasetId.trim(),
    source: config.source.trim() || "Uploaded historical CSV/TXT",
    sourceUtcOffsetMinutes: config.sourceUtcOffsetMinutes,
    assumedSpreadPips: config.assumedSpreadPips,
    startAt,
    endAt,
    initialBalance: config.initialBalance,
    riskPercent: config.riskPercent,
    intrabarConflictPolicy: config.intrabarConflictPolicy,
    maxOpenPositions: config.maxOpenPositions,
    maxTotalOpenRiskPercent: config.maxTotalOpenRiskPercent,
    maxReplaySteps,
  };

  const runner = new HistoricalReplayRunner(imported.dataset, {
    startAt,
    endAt,
    stepTimeframe: "M15",
    executionMode: "LIVE",
    accountBalance: config.initialBalance,
    riskPercent: config.riskPercent,
    execution: {
      enabled: true,
      executionTimeframe: "M15",
      intrabarConflictPolicy: config.intrabarConflictPolicy,
      maxOpenPositions: config.maxOpenPositions,
      maxTotalOpenRiskPercent: config.maxTotalOpenRiskPercent,
    },
  });

  const totalSteps = stepEstimate;
  const onProgress = options?.onProgress;
  const signal = options?.signal;
  let completedSteps = 0;

  const result = await runner.run({
    collectSteps: false,
    onStep: async () => {
      if (signal?.aborted) {
        const cancelError = new Error("Backtest job cancelled by user.");
        cancelError.name = "AbortError";
        throw cancelError;
      }
      completedSteps += 1;
      if (onProgress) onProgress(completedSteps, totalSteps);
      // Yield the event loop so concurrent HTTP polls stay responsive
      // while the replay saturates the CPU.
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  });
  if (!result.execution || !result.analytics) {
    throw new Error(
      "Historical replay completed without execution/analytics output."
    );
  }

  const completedAt = Date.now();
  const id =
    "backtest-" +
    safeId(config.datasetId) +
    "-" +
    completedAt.toString(36);

  return {
    schemaVersion: 1,
    id,
    createdAt: startedWallClock,
    completedAt,
    durationMs: Math.max(0, completedAt - startedWallClock),
    config: resolved,
    validation,
    execution: result.execution,
    analytics: result.analytics,
  };
}

function validateRunNumbers(
  config: BacktestRunConfig,
  issues: HistoricalImportIssue[]
): void {
  const positive = (
    value: number,
    code: string,
    label: string,
    allowZero = false
  ) => {
    if (
      !Number.isFinite(value) ||
      (allowZero ? value < 0 : value <= 0)
    ) {
      issues.push({
        severity: "ERROR",
        code,
        message: label + " must be a finite " + (allowZero ? "non-negative" : "positive") + " number.",
      });
    }
  };

  positive(config.initialBalance, "INITIAL_BALANCE_INVALID", "Initial balance");
  positive(config.riskPercent, "RISK_PERCENT_INVALID", "Risk percent");
  positive(
    config.assumedSpreadPips,
    "ASSUMED_SPREAD_INVALID",
    "Assumed spread",
    true
  );
  positive(
    config.maxTotalOpenRiskPercent,
    "MAX_TOTAL_RISK_INVALID",
    "Maximum total open risk percent"
  );
  if (
    !Number.isInteger(config.maxOpenPositions) ||
    config.maxOpenPositions <= 0
  ) {
    issues.push({
      severity: "ERROR",
      code: "MAX_OPEN_POSITIONS_INVALID",
      message: "Maximum open positions must be a positive integer.",
    });
  }
}

function withAdditionalIssues(
  validation: HistoricalDatasetValidation,
  issues: HistoricalImportIssue[],
  estimatedM15Steps: number
): HistoricalDatasetValidation {
  const combined = [...validation.issues, ...issues];
  return {
    ...validation,
    valid: !combined.some((issue) => issue.severity === "ERROR"),
    estimatedM15Steps,
    issues: combined,
  };
}

function safeId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "dataset";
}
