import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import { defaultEngineConfig } from "@/core/config/engine-config";
import { DEFAULT_STRATEGY_CONFIG } from "@/core/strategies/config";
import { STRATEGY_SYSTEM_POLICY } from "@/core/strategies/system-policy";
import {
  DEFAULT_FRESHNESS_THRESHOLDS,
  DEFAULT_SCANNER_CONFIG,
  DEFAULT_SIGNAL_TTL,
  DEFAULT_TIMEFRAME_ROLES,
} from "@/config/scanner";
import type { HistoricalTrade } from "@/replay/execution-types";
import type {
  BacktestReproducibilityFingerprint,
  PurgeEmbargoOptions,
  RobustnessPeriodMetrics,
  SequentialValidationDiagnostics,
  SequentialValidationFold,
  SequentialValidationResult,
  TemporalHoldoutResult,
} from "@/replay/robustness-types";

export function calculateTemporalHoldout(
  artifact: BacktestRunArtifact,
  splitRatio = 0.7,
  options: PurgeEmbargoOptions = {}
): TemporalHoldoutResult {
  validateSplitRatio(splitRatio);
  const { startAt, endAt } = artifact.config;
  if (endAt <= startAt) {
    throw new Error("Backtest window must have positive duration.");
  }
  const purge = options.purge ?? true;
  const embargoMs = options.embargoMs ?? 0;
  if (!Number.isFinite(embargoMs) || embargoMs < 0) {
    throw new Error("embargoMs must be a non-negative finite number.");
  }

  const splitAt = Math.floor(startAt + (endAt - startAt) * splitRatio);

  // H4-4: purge. A trade opened in-sample but closed at or after the split
  // is removed from in-sample. Its price path lives in the out-of-sample
  // window, so counting its realized PnL in-sample leaks future information
  // backwards.
  const inSampleTrades = artifact.execution.trades.filter((trade) => {
    if (trade.openedAt < startAt) return false;
    if (trade.openedAt >= splitAt) return false;
    if (purge && trade.closedAt >= splitAt) return false;
    return true;
  });

  // Out-of-sample starts after the embargo cooling period.
  const outOfSampleStart = splitAt + embargoMs;
  const outOfSampleTrades = artifact.execution.trades.filter(
    (trade) => trade.openedAt >= outOfSampleStart && trade.openedAt <= endAt
  );

  const inSample = periodMetrics(inSampleTrades);
  const outOfSample = periodMetrics(outOfSampleTrades);

  return {
    splitRatio,
    splitAt,
    inSample: {
      startAt,
      endAt: splitAt,
      metrics: inSample,
    },
    outOfSample: {
      startAt: splitAt,
      endAt,
      metrics: outOfSample,
    },
    delta: {
      sampleSize: outOfSample.sampleSize - inSample.sampleSize,
      winRate: nullableDelta(outOfSample.winRate, inSample.winRate),
      profitFactor: nullableDelta(
        outOfSample.profitFactor,
        inSample.profitFactor
      ),
      expectancyR: nullableDelta(
        outOfSample.expectancyR,
        inSample.expectancyR
      ),
      averageR: nullableDelta(outOfSample.averageR, inSample.averageR),
      netR: outOfSample.netR - inSample.netR,
    },
  };
}

/**
 * Expanding-window sequential validation.
 *
 * The total backtest period is split into (foldCount + 1) equal time segments.
 * Fold 1 develops on segment 1 and validates on segment 2. Each following fold
 * expands the development window from the original start, then validates only
 * on the next untouched time segment.
 *
 * This is deliberately NOT parameter optimization. The strategy is fixed.
 */
export function calculateSequentialValidation(
  artifact: BacktestRunArtifact,
  foldCount = 4,
  options: PurgeEmbargoOptions = {}
): SequentialValidationResult {
  if (!Number.isInteger(foldCount) || foldCount < 2 || foldCount > 8) {
    throw new Error("Sequential validation foldCount must be an integer from 2 to 8.");
  }

  const purge = options.purge ?? true;
  const embargoMs = options.embargoMs ?? 0;
  if (!Number.isFinite(embargoMs) || embargoMs < 0) {
    throw new Error("embargoMs must be a non-negative finite number.");
  }

  const { startAt, endAt } = artifact.config;
  const duration = endAt - startAt;
  if (duration <= 0) {
    throw new Error("Backtest window must have positive duration.");
  }

  const segmentCount = foldCount + 1;
  const folds: SequentialValidationFold[] = [];

  for (let index = 0; index < foldCount; index += 1) {
    const developmentEndAt = boundary(
      startAt,
      duration,
      index + 1,
      segmentCount
    );
    const validationStartAt = developmentEndAt;
    const validationEndAt =
      index === foldCount - 1
        ? endAt
        : boundary(startAt, duration, index + 2, segmentCount);

    // H4-4: development must be fully closed before the validation start.
    // Without purge, a development trade can stay open into the validation
    // window, so the fold validation sample is contaminated by trades whose
    // realized PnL depends on out-of-sample prices.
    const developmentTrades = artifact.execution.trades.filter((trade) => {
      if (trade.openedAt < startAt) return false;
      if (trade.openedAt >= developmentEndAt) return false;
      if (purge && trade.closedAt >= developmentEndAt) return false;
      return true;
    });

    // H4-4: embargo. When enabled, the first embargoMs of the validation
    // window is skipped to let serial correlation from development decay.
    const effectiveValidationStart =
      embargoMs > 0 ? validationStartAt + embargoMs : validationStartAt;

    const validationTrades = artifact.execution.trades.filter((trade) => {
      if (trade.openedAt < effectiveValidationStart) return false;
      if (index === foldCount - 1) {
        return trade.openedAt <= validationEndAt;
      }
      return trade.openedAt < validationEndAt;
    });

    folds.push({
      index: index + 1,
      developmentStartAt: startAt,
      developmentEndAt,
      validationStartAt: effectiveValidationStart,
      validationEndAt,
      development: periodMetrics(developmentTrades),
      validation: periodMetrics(validationTrades),
    });
  }

  return {
    foldCount,
    folds,
    diagnostics: diagnostics(folds),
  };
}

export function buildBacktestReproducibilityFingerprint(
  artifact: BacktestRunArtifact
): BacktestReproducibilityFingerprint {
  const assumptionsPayload = stableStringify({
    protocolVersion: "phase-5.6-v1",
    config: artifact.config,
    strategyBaseline: {
      engineConfig: defaultEngineConfig,
      strategyConfig: DEFAULT_STRATEGY_CONFIG,
      strategySystem: STRATEGY_SYSTEM_POLICY,
      scanner: {
        timeframeRoles: DEFAULT_TIMEFRAME_ROLES,
        signalTtl: DEFAULT_SIGNAL_TTL,
        freshness: DEFAULT_FRESHNESS_THRESHOLDS,
        candleLookback: DEFAULT_SCANNER_CONFIG.candleLookback,
      },
    },
    dataset: {
      id: artifact.validation.datasetId,
      source: artifact.validation.source,
      sourceUtcOffsetMinutes: artifact.validation.sourceUtcOffsetMinutes,
      assumedSpreadPips: artifact.validation.assumedSpreadPips,
      symbols: artifact.validation.symbols,
      files: artifact.validation.files.map((file) => ({
        fileName: file.fileName,
        symbol: file.symbol,
        timeframe: file.timeframe,
        rowCount: file.rowCount,
        importedRows: file.importedRows,
        duplicateRows: file.duplicateRows,
        startAt: file.startAt,
        endAt: file.endAt,
      })),
      series: artifact.validation.series.map((series) => ({
        symbol: series.symbol,
        timeframe: series.timeframe,
        candleCount: series.candleCount,
        startAt: series.startAt,
        endAt: series.endAt,
        nonWeekendGapCount: series.nonWeekendGapCount,
        largestGapMs: series.largestGapMs,
      })),
    },
  });

  const outcomesPayload = stableStringify({
    trades: artifact.execution.trades.map((trade) => ({
      signalId: trade.signalId,
      symbol: trade.symbol,
      side: trade.side,
      openedAt: trade.openedAt,
      closedAt: trade.closedAt,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      positionSize: trade.positionSize,
      riskAmount: trade.riskAmount,
      realizedPnL: trade.realizedPnL,
      realizedR: trade.realizedR,
      closeReason: trade.closeReason,
      strategyId: trade.engine.strategyId ?? null,
    })),
    analytics: {
      sampleSize: artifact.analytics.sampleSize,
      netPnL: artifact.analytics.netPnL,
      netR: artifact.analytics.netR,
      expectancyR: artifact.analytics.expectancyR,
      maxEquityDrawdownPercent:
        artifact.analytics.maxEquityDrawdownPercent,
    },
  });

  const assumptions = fingerprint(assumptionsPayload);
  const outcomes = fingerprint(outcomesPayload);
  const combined = fingerprint(
    stableStringify({
      protocolVersion: "phase-5.6-v1",
      assumptions,
      outcomes,
    })
  );

  return {
    protocolVersion: "phase-5.6-v1",
    algorithm: "fnv1a32x2",
    assumptions,
    outcomes,
    combined,
  };
}

function periodMetrics(trades: HistoricalTrade[]): RobustnessPeriodMetrics {
  const ordered = [...trades].sort(
    (a, b) => a.closedAt - b.closedAt || a.id.localeCompare(b.id)
  );
  const wins = ordered.filter((trade) => trade.realizedPnL > 0);
  const losses = ordered.filter((trade) => trade.realizedPnL < 0);
  const breakEven = ordered.length - wins.length - losses.length;
  const grossProfit = sum(wins.map((trade) => trade.realizedPnL));
  const grossLoss = sum(losses.map((trade) => trade.realizedPnL));
  const rValues = ordered.map((trade) => trade.realizedR);

  return {
    sampleSize: ordered.length,
    wins: wins.length,
    losses: losses.length,
    breakEven,
    winRate:
      ordered.length > 0 ? (wins.length / ordered.length) * 100 : null,
    profitFactor:
      grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null,
    netPnL: sum(ordered.map((trade) => trade.realizedPnL)),
    netR: sum(rValues),
    averageR: average(rValues),
    medianR: median(rValues),
    expectancyR: average(rValues),
    maxConsecutiveLosses: maxConsecutiveLosses(ordered),
  };
}

function diagnostics(
  folds: SequentialValidationFold[]
): SequentialValidationDiagnostics {
  const withTrades = folds.filter((fold) => fold.validation.sampleSize > 0);
  const expectancyValues = withTrades
    .map((fold) => fold.validation.expectancyR)
    .filter((value): value is number => value !== null);
  const winRates = withTrades
    .map((fold) => fold.validation.winRate)
    .filter((value): value is number => value !== null);
  const sampleSizes = withTrades.map((fold) => fold.validation.sampleSize);

  return {
    foldCount: folds.length,
    foldsWithTrades: withTrades.length,
    positiveExpectancyFolds: expectancyValues.filter((value) => value > 0)
      .length,
    nonPositiveExpectancyFolds: expectancyValues.filter((value) => value <= 0)
      .length,
    emptyFolds: folds.length - withTrades.length,
    expectancyRMean: average(expectancyValues),
    expectancyRStandardDeviation: populationStandardDeviation(expectancyValues),
    expectancyRMin:
      expectancyValues.length > 0 ? Math.min(...expectancyValues) : null,
    expectancyRMax:
      expectancyValues.length > 0 ? Math.max(...expectancyValues) : null,
    winRateStandardDeviation: populationStandardDeviation(winRates),
    validationSampleMin:
      sampleSizes.length > 0 ? Math.min(...sampleSizes) : null,
    validationSampleMax:
      sampleSizes.length > 0 ? Math.max(...sampleSizes) : null,
    validationTradeCount: sum(sampleSizes),
  };
}

function validateSplitRatio(value: number): void {
  if (!Number.isFinite(value) || value < 0.5 || value > 0.9) {
    throw new Error("Temporal holdout splitRatio must be between 0.5 and 0.9.");
  }
}

function boundary(
  startAt: number,
  duration: number,
  numerator: number,
  denominator: number
): number {
  return Math.floor(startAt + (duration * numerator) / denominator);
}

function maxConsecutiveLosses(trades: HistoricalTrade[]): number {
  let current = 0;
  let maximum = 0;
  for (const trade of trades) {
    if (trade.realizedPnL < 0) {
      current += 1;
      maximum = Math.max(maximum, current);
    } else {
      current = 0;
    }
  }
  return maximum;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function populationStandardDeviation(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = average(values)!;
  return Math.sqrt(
    sum(values.map((value) => (value - mean) ** 2)) / values.length
  );
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function nullableDelta(
  next: number | null,
  previous: number | null
): number | null {
  return next === null || previous === null ? null : next - previous;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(input)
        .sort()
        .map((key) => [key, stableValue(input[key])])
    );
  }
  return value;
}

/**
 * Small deterministic non-cryptographic fingerprint suitable for reproducibility
 * labels. It is not a security hash.
 */
function fingerprint(value: string): string {
  const left = fnv1a32(value, 0x811c9dc5);
  const right = fnv1a32(value, 0x9e3779b9);
  return toHex(left) + toHex(right);
}

function fnv1a32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function toHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}
