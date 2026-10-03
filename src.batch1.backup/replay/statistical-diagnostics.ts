import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  buildBacktestReproducibilityFingerprint,
  calculateSequentialValidation,
  calculateTemporalHoldout,
} from "@/replay/robustness-validation";
import type {
  BacktestStatisticalDiagnostics,
  BootstrapExpectancyDiagnostics,
  SampleAdequacyWarning,
  StatisticalInterval,
  TradeOrderMonteCarloDiagnostics,
  ValidationSummaryExport,
} from "@/replay/statistical-diagnostics-types";

const DEFAULT_BOOTSTRAP_ITERATIONS = 2_000;
const DEFAULT_MONTE_CARLO_ITERATIONS = 2_000;
const Z_95 = 1.959963984540054;

export function calculateBacktestStatisticalDiagnostics(
  artifact: BacktestRunArtifact,
  options: {
    bootstrapIterations?: number;
    monteCarloIterations?: number;
  } = {}
): BacktestStatisticalDiagnostics {
  const trades = [...artifact.execution.trades].sort(
    (a, b) => a.closedAt - b.closedAt || a.id.localeCompare(b.id)
  );
  const rValues = trades.map((trade) => trade.realizedR);
  const wins = trades.filter((trade) => trade.realizedPnL > 0).length;
  const fingerprint = buildBacktestReproducibilityFingerprint(artifact);
  const seed = seedFromFingerprint(fingerprint.combined);

  const bootstrapIterations =
    options.bootstrapIterations ?? DEFAULT_BOOTSTRAP_ITERATIONS;
  const monteCarloIterations =
    options.monteCarloIterations ?? DEFAULT_MONTE_CARLO_ITERATIONS;
  validateIterations(bootstrapIterations, "bootstrapIterations");
  validateIterations(monteCarloIterations, "monteCarloIterations");

  return {
    sampleSize: trades.length,
    winRateWilson95:
      trades.length === 0
        ? null
        : wilsonProportionInterval(wins, trades.length),
    expectancyRBootstrap95:
      rValues.length === 0
        ? null
        : bootstrapExpectancy(
            rValues,
            bootstrapIterations,
            seed ^ 0xa5a5a5a5
          ),
    tradeOrderMonteCarlo:
      rValues.length === 0
        ? null
        : tradeOrderMonteCarlo(
            rValues,
            monteCarloIterations,
            seed ^ 0x5a5a5a5a
          ),
    sampleWarnings: buildSampleAdequacyWarnings(artifact),
  };
}

export function buildValidationSummary(
  artifact: BacktestRunArtifact,
  precomputedDiagnostics?: BacktestStatisticalDiagnostics
): ValidationSummaryExport {
  const fingerprint = buildBacktestReproducibilityFingerprint(artifact);
  const holdout = calculateTemporalHoldout(artifact, 0.7);
  const sequential = calculateSequentialValidation(artifact, 4);
  const diagnostics =
    precomputedDiagnostics ?? calculateBacktestStatisticalDiagnostics(artifact);

  return {
    schemaVersion: 1,
    protocol: "phase-5.7-v1",
    report: {
      id: artifact.id,
      label: artifact.metadata?.label || null,
      tags: artifact.metadata?.tags ? [...artifact.metadata.tags] : [],
      datasetId: artifact.config.datasetId,
      source: artifact.config.source,
      symbols: [...artifact.validation.symbols],
      startAt: artifact.config.startAt,
      endAt: artifact.config.endAt,
    },
    assumptions: {
      sourceUtcOffsetMinutes: artifact.config.sourceUtcOffsetMinutes,
      assumedSpreadPips: artifact.config.assumedSpreadPips,
      initialBalance: artifact.config.initialBalance,
      riskPercent: artifact.config.riskPercent,
      maxOpenPositions: artifact.config.maxOpenPositions,
      maxTotalOpenRiskPercent: artifact.config.maxTotalOpenRiskPercent,
      intrabarConflictPolicy: artifact.config.intrabarConflictPolicy,
    },
    reproducibility: fingerprint,
    corePerformance: {
      sampleSize: artifact.analytics.sampleSize,
      winRate: artifact.analytics.winRate,
      profitFactor: artifact.analytics.profitFactor,
      expectancyR: artifact.analytics.expectancyR,
      averageR: artifact.analytics.averageR,
      netR: artifact.analytics.netR,
      netReturnPercent: artifact.analytics.netReturnPercent,
      maxEquityDrawdownPercent: artifact.analytics.maxEquityDrawdownPercent,
    },
    holdout70_30: {
      splitAt: holdout.splitAt,
      inSampleSampleSize: holdout.inSample.metrics.sampleSize,
      outOfSampleSampleSize: holdout.outOfSample.metrics.sampleSize,
      inSampleExpectancyR: holdout.inSample.metrics.expectancyR,
      outOfSampleExpectancyR: holdout.outOfSample.metrics.expectancyR,
      inSampleWinRate: holdout.inSample.metrics.winRate,
      outOfSampleWinRate: holdout.outOfSample.metrics.winRate,
    },
    sequential4Fold: {
      foldCount: sequential.diagnostics.foldCount,
      foldsWithTrades: sequential.diagnostics.foldsWithTrades,
      emptyFolds: sequential.diagnostics.emptyFolds,
      validationTradeCount: sequential.diagnostics.validationTradeCount,
      positiveExpectancyFolds:
        sequential.diagnostics.positiveExpectancyFolds,
      nonPositiveExpectancyFolds:
        sequential.diagnostics.nonPositiveExpectancyFolds,
      expectancyRMean: sequential.diagnostics.expectancyRMean,
      expectancyRStandardDeviation:
        sequential.diagnostics.expectancyRStandardDeviation,
    },
    statisticalDiagnostics: diagnostics,
    interpretationNotes: [
      "Confidence intervals describe uncertainty in the observed historical sample; they do not guarantee future performance.",
      "Bootstrap expectancy resamples historical trades with replacement and therefore depends on the representativeness of the historical sample.",
      "Trade-order Monte Carlo shuffles the same realized R outcomes; terminal Net R is unchanged while path-dependent drawdown can change.",
      "Small out-of-sample or fold samples are retained and surfaced as warnings rather than silently discarded.",
      "No parameter optimization, automatic strategy ranking, or parameter selection is performed by Phase 5.7.",
    ],
  };
}

export function wilsonProportionInterval(
  successes: number,
  total: number,
  confidenceLevel = 0.95
): StatisticalInterval {
  if (!Number.isInteger(successes) || !Number.isInteger(total)) {
    throw new Error("Wilson interval counts must be integers.");
  }
  if (total <= 0 || successes < 0 || successes > total) {
    throw new Error("Wilson interval requires 0 <= successes <= total and total > 0.");
  }
  if (confidenceLevel !== 0.95) {
    throw new Error("Phase 5.7 currently supports a 95% Wilson interval only.");
  }

  const p = successes / total;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin =
    (Z_95 / denominator) *
    Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));

  return {
    confidenceLevel,
    estimate: p * 100,
    lower: Math.max(0, center - margin) * 100,
    upper: Math.min(1, center + margin) * 100,
  };
}

function bootstrapExpectancy(
  rValues: number[],
  iterations: number,
  seed: number
): BootstrapExpectancyDiagnostics {
  const random = mulberry32(seed);
  const sampleMeans: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let index = 0; index < rValues.length; index += 1) {
      const sourceIndex = Math.floor(random() * rValues.length);
      total += rValues[sourceIndex];
    }
    sampleMeans.push(total / rValues.length);
  }

  sampleMeans.sort((a, b) => a - b);
  const estimate = average(rValues);
  const lower = quantileSorted(sampleMeans, 0.025);
  const upper = quantileSorted(sampleMeans, 0.975);
  const positive = sampleMeans.filter((value) => value > 0).length;

  return {
    iterations,
    seed: seed >>> 0,
    interval: {
      confidenceLevel: 0.95,
      estimate,
      lower,
      upper,
    },
    positiveResampleFraction: positive / iterations,
  };
}

function tradeOrderMonteCarlo(
  rValues: number[],
  iterations: number,
  seed: number
): TradeOrderMonteCarloDiagnostics {
  const random = mulberry32(seed);
  const drawdowns: number[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const shuffled = [...rValues];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      const temp = shuffled[index];
      shuffled[index] = shuffled[swapIndex];
      shuffled[swapIndex] = temp;
    }
    drawdowns.push(maxCumulativeRDrawdown(shuffled));
  }

  drawdowns.sort((a, b) => a - b);

  return {
    iterations,
    seed: seed >>> 0,
    observedMaxDrawdownR: maxCumulativeRDrawdown(rValues),
    medianMaxDrawdownR: quantileSorted(drawdowns, 0.5),
    p90MaxDrawdownR: quantileSorted(drawdowns, 0.9),
    p95MaxDrawdownR: quantileSorted(drawdowns, 0.95),
    p99MaxDrawdownR: quantileSorted(drawdowns, 0.99),
    worstMaxDrawdownR: drawdowns[drawdowns.length - 1] ?? 0,
  };
}

export function buildSampleAdequacyWarnings(
  artifact: BacktestRunArtifact
): SampleAdequacyWarning[] {
  const warnings: SampleAdequacyWarning[] = [];
  const fullSample = artifact.execution.trades.length;
  const holdout = calculateTemporalHoldout(artifact, 0.7);
  const sequential = calculateSequentialValidation(artifact, 4);
  const oosSample = holdout.outOfSample.metrics.sampleSize;
  const foldSamples = sequential.folds.map(
    (fold) => fold.validation.sampleSize
  );
  const minimumFold = foldSamples.length > 0 ? Math.min(...foldSamples) : 0;

  if (fullSample < 30) {
    warnings.push({
      code: "FULL_SAMPLE_VERY_SMALL",
      severity: "WARNING",
      scope: "FULL_SAMPLE",
      sampleSize: fullSample,
      suggestedMinimum: 30,
      message:
        "Fewer than 30 closed trades: confidence intervals and resampling diagnostics are highly sample-sensitive.",
    });
  } else if (fullSample < 100) {
    warnings.push({
      code: "FULL_SAMPLE_LIMITED",
      severity: "INFO",
      scope: "FULL_SAMPLE",
      sampleSize: fullSample,
      suggestedMinimum: 100,
      message:
        "Fewer than 100 closed trades: treat narrow-looking statistical ranges cautiously.",
    });
  }

  if (oosSample < 30) {
    warnings.push({
      code: "OOS_SAMPLE_SMALL",
      severity: "WARNING",
      scope: "OUT_OF_SAMPLE",
      sampleSize: oosSample,
      suggestedMinimum: 30,
      message:
        "The 70/30 out-of-sample period has fewer than 30 trades, so OOS metrics may be unstable.",
    });
  }

  if (minimumFold < 10) {
    warnings.push({
      code: "SEQUENTIAL_FOLD_SAMPLE_SMALL",
      severity: "WARNING",
      scope: "SEQUENTIAL_FOLDS",
      sampleSize: minimumFold,
      suggestedMinimum: 10,
      message:
        "At least one 4-fold sequential validation window has fewer than 10 trades.",
    });
  }

  return warnings;
}

function maxCumulativeRDrawdown(values: number[]): number {
  let equity = 0;
  let peak = 0;
  let maximum = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maximum = Math.max(maximum, peak - equity);
  }
  return maximum;
}

function quantileSorted(values: number[], q: number): number {
  if (values.length === 0) {
    throw new Error("Cannot calculate quantile of an empty sample.");
  }
  const position = (values.length - 1) * q;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) return values[lowerIndex];
  const weight = position - lowerIndex;
  return (
    values[lowerIndex] * (1 - weight) + values[upperIndex] * weight
  );
}

function validateIterations(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 100 || value > 20_000) {
    throw new Error(label + " must be an integer from 100 to 20000.");
  }
}

function seedFromFingerprint(value: string): number {
  const parsed = Number.parseInt(value.slice(0, 8), 16);
  return Number.isFinite(parsed) ? parsed >>> 0 : 0x6d2b79f5;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
