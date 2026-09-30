import {
  DEFAULT_FORWARD_VALIDATION_CONFIG,
  type ForwardValidationConfig,
} from "@/config/forward-validation";
import {
  compareHistoricalToForward,
} from "@/replay/backtest-analytics";
import { calculatePerformance } from "@/paper/calculations";
import type { PaperStoreState, PaperTrade } from "@/paper/types";
import type { StrategyVersionManifest } from "@/replay/strategy-version-types";
import type {
  ComparablePerformance,
} from "@/replay/analytics-types";
import type {
  ForwardDriftIndicator,
  ForwardOperationalSummary,
  ForwardValidationObservation,
  ForwardValidationReport,
} from "@/forward-validation/types";

export function buildForwardValidationReport(input: {
  manifest: StrategyVersionManifest;
  activationAt: number;
  paper: PaperStoreState;
  observations: ForwardValidationObservation[];
  generatedAt?: number;
  config?: Partial<ForwardValidationConfig>;
}): ForwardValidationReport {
  const generatedAt = input.generatedAt ?? Date.now();
  const config = {
    ...DEFAULT_FORWARD_VALIDATION_CONFIG,
    ...(input.config ?? {}),
  };
  const version = input.manifest.version;
  const fingerprint = input.manifest.manifestFingerprint;

  const trades = input.paper.trades
    .filter((trade) =>
      tradeMatchesRelease(trade, version, fingerprint, input.activationAt)
    )
    .sort((a, b) => a.closedAt - b.closedAt || a.id.localeCompare(b.id));
  const observations = input.observations
    .filter(
      (item) =>
        item.strategyVersion === version &&
        item.manifestFingerprint === fingerprint &&
        item.activationAt === input.activationAt
    )
    .sort((a, b) => a.observedAt - b.observedAt);

  const historical = historicalComparable(input.manifest);
  const performance = calculatePerformance(
    trades,
    input.paper.account.initialBalance
  );
  const forward: ComparablePerformance = {
    sampleSize: performance.totalTrades,
    winRate: performance.winRate,
    profitFactor: performance.profitFactor,
    expectancyR: performance.expectancyR,
    averageR: performance.averageR,
    maxDrawdownPercent: performance.maxDrawdownPercent,
    netReturnPercent:
      input.paper.account.initialBalance > 0
        ? (performance.netPnL / input.paper.account.initialBalance) * 100
        : 0,
  };
  const comparison = compareHistoricalToForward(historical, forward);
  const forwardMaxDrawdownR = maxCumulativeRDrawdown(
    trades.map((trade) => trade.realizedR)
  );
  const historicalP95DrawdownR =
    input.manifest.validationSummary.statisticalDiagnostics
      .tradeOrderMonteCarlo?.p95MaxDrawdownR ?? null;
  const operational = summarizeOperations(observations);
  const indicators = buildIndicators({
    manifest: input.manifest,
    forward,
    forwardMaxDrawdownR,
    historicalP95DrawdownR,
    operational,
    config,
  });

  const counts = {
    insufficient: indicators.filter(
      (item) => item.status === "INSUFFICIENT_DATA"
    ).length,
    withinReference: indicators.filter(
      (item) => item.status === "WITHIN_REFERENCE"
    ).length,
    outsideReference: indicators.filter(
      (item) => item.status === "OUTSIDE_REFERENCE"
    ).length,
    attention: indicators.filter(
      (item) => item.status === "ATTENTION"
    ).length,
    info: indicators.filter((item) => item.status === "INFO").length,
  };

  const status =
    counts.outsideReference > 0 || counts.attention > 0
      ? "ATTENTION"
      : trades.length < config.minimumTradeSample
        ? "COLLECTING"
        : "MONITORING";

  return {
    schemaVersion: 1,
    protocol: "phase-7-forward-v1",
    generatedAt,
    status,
    release: {
      version,
      title: input.manifest.title,
      manifestFingerprint: fingerprint,
      sourceReportId: input.manifest.sourceReportId,
      activationAt: input.activationAt,
    },
    sample: {
      tradeCount: trades.length,
      firstTradeOpenedAt: trades[0]?.openedAt ?? null,
      lastTradeClosedAt: trades[trades.length - 1]?.closedAt ?? null,
      trades: structuredClone(trades),
    },
    historical,
    forward,
    comparison,
    operational,
    forwardMaxDrawdownR,
    historicalP95DrawdownR,
    indicators,
    counts,
    interpretationNotes: [
      "Phase 7 compares only Paper trades tagged with the exact ACTIVE strategy version, manifest fingerprint and activation epoch.",
      "Forward drift statuses are descriptive monitoring evidence, not an automatic strategy promotion, rollback or parameter-change decision.",
      "Win-rate and expectancy checks use confidence intervals preserved in the immutable historical validation manifest.",
      "Forward path drawdown in R is compared with the historical trade-order Monte Carlo p95 drawdown reference when available.",
      "Different market regimes can move forward metrics outside historical reference ranges even when implementation is functioning correctly.",
      "Paper Trading remains simulated execution and does not measure broker fill quality, latency or real slippage.",
    ],
  };
}

function historicalComparable(
  manifest: StrategyVersionManifest
): ComparablePerformance {
  const core = manifest.validationSummary.corePerformance;
  return {
    sampleSize: core.sampleSize,
    winRate: core.winRate,
    profitFactor: core.profitFactor,
    expectancyR: core.expectancyR,
    averageR: core.averageR,
    maxDrawdownPercent: core.maxEquityDrawdownPercent,
    netReturnPercent: core.netReturnPercent,
  };
}

function tradeMatchesRelease(
  trade: PaperTrade,
  version: string,
  fingerprint: string,
  activationAt: number
): boolean {
  return (
    trade.engine.strategyVersion === version &&
    trade.engine.strategyManifestFingerprint === fingerprint &&
    trade.engine.strategyActivationAt === activationAt
  );
}

function buildIndicators(input: {
  manifest: StrategyVersionManifest;
  forward: ComparablePerformance;
  forwardMaxDrawdownR: number;
  historicalP95DrawdownR: number | null;
  operational: ForwardOperationalSummary;
  config: ForwardValidationConfig;
}): ForwardDriftIndicator[] {
  const enough =
    input.forward.sampleSize >= input.config.minimumTradeSample;
  const diagnostics =
    input.manifest.validationSummary.statisticalDiagnostics;
  const winReference = diagnostics.winRateWilson95;
  const expectancyReference =
    diagnostics.expectancyRBootstrap95?.interval ?? null;

  const indicators: ForwardDriftIndicator[] = [
    {
      id: "sample-adequacy",
      category: "SAMPLE",
      label: "Forward closed-trade sample",
      status: enough ? "INFO" : "INSUFFICIENT_DATA",
      forwardValue: input.forward.sampleSize,
      referenceLow: input.config.minimumTradeSample,
      referenceHigh: null,
      unit: "COUNT",
      detail: enough
        ? "Forward sample reached the Phase 7 monitoring minimum."
        : "Collect more release-scoped Paper trades before interpreting performance drift.",
    },
    intervalIndicator({
      id: "win-rate",
      label: "Forward win rate vs historical Wilson 95%",
      value: input.forward.winRate,
      low: winReference?.lower ?? null,
      high: winReference?.upper ?? null,
      unit: "%",
      enough,
    }),
    intervalIndicator({
      id: "expectancy-r",
      label: "Forward expectancy R vs historical bootstrap 95%",
      value: input.forward.expectancyR,
      low: expectancyReference?.lower ?? null,
      high: expectancyReference?.upper ?? null,
      unit: "R",
      enough,
    }),
    upperBoundIndicator({
      id: "path-drawdown-r",
      label: "Forward max path drawdown R vs historical Monte Carlo p95",
      value: input.forwardMaxDrawdownR,
      high: input.historicalP95DrawdownR,
      unit: "R",
      enough,
    }),
    thresholdIndicator({
      id: "provider-failure-rate",
      label: "Forward provider/symbol failure rate",
      value: input.operational.providerFailureRatePercent,
      high: input.config.dataFailureRateAttentionPercent,
      unit: "%",
      hasData: input.operational.symbolsRequested > 0,
    }),
    thresholdIndicator({
      id: "stale-data-rate",
      label: "Forward stale-data observation rate",
      value: input.operational.staleDataRatePercent,
      high: input.config.staleDataRateAttentionPercent,
      unit: "%",
      hasData: input.operational.symbolsRequested > 0,
    }),
    {
      id: "paper-constraint-rejections",
      category: "EXECUTION",
      label: "Paper constraint rejection rate",
      status: "INFO",
      forwardValue:
        input.operational.paperConstraintRejectionRatePercent,
      referenceLow: null,
      referenceHigh: null,
      unit: "%",
      detail:
        "Descriptive only: Paper rejections can reflect risk/open-position constraints and are not treated as broker execution drift.",
    },
  ];

  return indicators;
}

function intervalIndicator(input: {
  id: string;
  label: string;
  value: number | null;
  low: number | null;
  high: number | null;
  unit: "%" | "R";
  enough: boolean;
}): ForwardDriftIndicator {
  if (!input.enough) {
    return {
      id: input.id,
      category: "PERFORMANCE",
      label: input.label,
      status: "INSUFFICIENT_DATA",
      forwardValue: input.value,
      referenceLow: input.low,
      referenceHigh: input.high,
      unit: input.unit,
      detail: "Forward sample is below the monitoring minimum.",
    };
  }
  if (
    input.value === null ||
    input.low === null ||
    input.high === null
  ) {
    return {
      id: input.id,
      category: "PERFORMANCE",
      label: input.label,
      status: "INFO",
      forwardValue: input.value,
      referenceLow: input.low,
      referenceHigh: input.high,
      unit: input.unit,
      detail: "Historical confidence reference is unavailable.",
    };
  }
  const inside = input.value >= input.low && input.value <= input.high;
  return {
    id: input.id,
    category: "PERFORMANCE",
    label: input.label,
    status: inside ? "WITHIN_REFERENCE" : "OUTSIDE_REFERENCE",
    forwardValue: input.value,
    referenceLow: input.low,
    referenceHigh: input.high,
    unit: input.unit,
    detail: inside
      ? "Forward point estimate remains inside the preserved historical reference interval."
      : "Forward point estimate is outside the preserved historical reference interval; review context before drawing conclusions.",
  };
}

function upperBoundIndicator(input: {
  id: string;
  label: string;
  value: number;
  high: number | null;
  unit: "R";
  enough: boolean;
}): ForwardDriftIndicator {
  if (!input.enough) {
    return {
      id: input.id,
      category: "PATH_RISK",
      label: input.label,
      status: "INSUFFICIENT_DATA",
      forwardValue: input.value,
      referenceLow: null,
      referenceHigh: input.high,
      unit: input.unit,
      detail: "Forward sample is below the monitoring minimum.",
    };
  }
  if (input.high === null) {
    return {
      id: input.id,
      category: "PATH_RISK",
      label: input.label,
      status: "INFO",
      forwardValue: input.value,
      referenceLow: null,
      referenceHigh: null,
      unit: input.unit,
      detail: "Historical Monte Carlo drawdown reference is unavailable.",
    };
  }
  return {
    id: input.id,
    category: "PATH_RISK",
    label: input.label,
    status:
      input.value <= input.high
        ? "WITHIN_REFERENCE"
        : "OUTSIDE_REFERENCE",
    forwardValue: input.value,
    referenceLow: null,
    referenceHigh: input.high,
    unit: input.unit,
    detail:
      input.value <= input.high
        ? "Forward path drawdown does not exceed the historical Monte Carlo p95 reference."
        : "Forward path drawdown exceeds the historical Monte Carlo p95 reference; review market regime and implementation evidence.",
  };
}

function thresholdIndicator(input: {
  id: string;
  label: string;
  value: number;
  high: number;
  unit: "%";
  hasData: boolean;
}): ForwardDriftIndicator {
  return {
    id: input.id,
    category: "DATA_QUALITY",
    label: input.label,
    status: !input.hasData
      ? "INFO"
      : input.value > input.high
        ? "ATTENTION"
        : "WITHIN_REFERENCE",
    forwardValue: input.hasData ? input.value : null,
    referenceLow: 0,
    referenceHigh: input.high,
    unit: input.unit,
    detail: !input.hasData
      ? "No release-scoped scan observations are available yet."
      : input.value > input.high
        ? "Observed rate is above the configured Phase 7 attention threshold."
        : "Observed rate is within the configured Phase 7 attention threshold.",
  };
}

function summarizeOperations(
  observations: ForwardValidationObservation[]
): ForwardOperationalSummary {
  const symbolsRequested = sum(
    observations.map((item) => item.symbolsRequested)
  );
  const symbolsFailed = sum(
    observations.map((item) => item.symbolsFailed)
  );
  const staleSymbolCount = sum(
    observations.map((item) => item.freshness.stale)
  );
  const paperFilledCount = sum(
    observations.map((item) => item.paperFilledCount)
  );
  const paperRejectedCount = sum(
    observations.map((item) => item.paperRejectedCount)
  );
  const paperOrderCount = paperFilledCount + paperRejectedCount;
  const firstObservedAt = observations[0]?.observedAt ?? null;
  const lastObservedAt =
    observations[observations.length - 1]?.observedAt ?? null;

  return {
    observationCount: observations.length,
    firstObservedAt,
    lastObservedAt,
    calendarSpanDays:
      firstObservedAt !== null && lastObservedAt !== null
        ? Math.max(
            0,
            (lastObservedAt - firstObservedAt) / (24 * 60 * 60_000)
          )
        : 0,
    symbolsRequested,
    symbolsFailed,
    providerFailureRatePercent:
      symbolsRequested > 0
        ? (symbolsFailed / symbolsRequested) * 100
        : 0,
    staleSymbolCount,
    staleDataRatePercent:
      symbolsRequested > 0
        ? (staleSymbolCount / symbolsRequested) * 100
        : 0,
    engineExecuteCount: sum(
      observations.map((item) => item.engineExecuteCount)
    ),
    lifecycleExecuteCount: sum(
      observations.map((item) => item.lifecycleExecuteCount)
    ),
    paperFilledCount,
    paperRejectedCount,
    paperConstraintRejectionRatePercent:
      paperOrderCount > 0
        ? (paperRejectedCount / paperOrderCount) * 100
        : null,
  };
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

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
