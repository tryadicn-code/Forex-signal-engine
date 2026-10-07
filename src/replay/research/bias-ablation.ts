/**
 * TRD-007 research harness: bias component ablation study.
 *
 * Runs five Replay configurations (baseline + four ablations) on the same
 * dataset and IS/OOS split, then reports per-config metrics, path robustness,
 * exploratory effect size vs baseline, strategy-bucket consistency, and a
 * paired opportunity analysis.
 *
 * Design doc: docs/research/TRD-007-design.md
 *
 * This module is research-only. It lives outside src/core/ and is never
 * imported by production paths.
 */

import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import type { BiasComponent } from "@/types/engine";
import type { ReplayDataset, ReplayRunConfig } from "@/replay/types";
import { HistoricalReplayRunner } from "@/replay/historical-replay-runner";
import {
  calculateHistoricalAnalytics,
} from "@/replay/backtest-analytics";
import type { HistoricalBacktestAnalytics } from "@/replay/analytics-types";
import type {
  HistoricalExecutionSummary,
  HistoricalTrade,
} from "@/replay/execution-types";
import { pathRobustnessDiagnostic } from "@/replay/pbo";

export type AblationId =
  | "baseline"
  | "ablate-structure"
  | "ablate-trend"
  | "ablate-regime"
  | "ablate-momentum";

export interface AblationSpec {
  id: AblationId;
  label: string;
  weights: Record<BiasComponent, number>;
  ablatedComponent: BiasComponent | null;
}

const BASELINE_WEIGHTS: Record<BiasComponent, number> = {
  structure: 35,
  trend: 25,
  regime: 20,
  momentum: 20,
};

export const DEFAULT_ABLATIONS: readonly AblationSpec[] = [
  {
    id: "baseline",
    label: "Baseline (35/25/20/20)",
    weights: { ...BASELINE_WEIGHTS },
    ablatedComponent: null,
  },
  {
    id: "ablate-structure",
    label: "Ablate structure",
    weights: { ...BASELINE_WEIGHTS, structure: 0 },
    ablatedComponent: "structure",
  },
  {
    id: "ablate-trend",
    label: "Ablate trend",
    weights: { ...BASELINE_WEIGHTS, trend: 0 },
    ablatedComponent: "trend",
  },
  {
    id: "ablate-regime",
    label: "Ablate regime",
    weights: { ...BASELINE_WEIGHTS, regime: 0 },
    ablatedComponent: "regime",
  },
  {
    id: "ablate-momentum",
    label: "Ablate momentum",
    weights: { ...BASELINE_WEIGHTS, momentum: 0 },
    ablatedComponent: "momentum",
  },
];

const MIN_CONFIG_TRADES = 30;
const MIN_BUCKET_TRADES = 20;

export interface AblationRunConfig {
  dataset: ReplayDataset;
  startAt: number;
  endAt: number;
  isOosSplitRatio?: number;
  symbols?: string[];
  executionConfig?: ReplayRunConfig["execution"];
}

export interface PathRobustnessSummary {
  robustnessScore: number;
  outOfSampleFailureRate: number;
  meanDegradation: number;
  observations: number;
}

export interface AblationMetrics {
  sampleSize: number;
  winRate: number | null;
  expectancyR: number | null;
  averageR: number | null;
  sharpeR: number | null;
  profitFactor: number | null;
  maxEquityDrawdownPercent: number;
}

export interface AblationRunResult {
  id: AblationId;
  label: string;
  ablatedComponent: BiasComponent | null;
  isTrades: HistoricalTrade[];
  oosTrades: HistoricalTrade[];
  isMetrics: AblationMetrics | null;
  oosMetrics: AblationMetrics | null;
  isRobustness: PathRobustnessSummary | null;
  oosRobustness: PathRobustnessSummary | null;
  insufficientSample: boolean;
}

export interface StrategyBucket {
  key: string;
  sampleSize: number;
  expectancyR: number | null;
}

export interface StrategyConsistency {
  ablatedComponent: BiasComponent;
  buckets: StrategyBucket[];
  signAgreementCount: number;
  contradictingBuckets: string[];
  consistent: boolean;
  inconclusive: boolean;
}

export interface PairedOpportunity {
  ablatedComponent: BiasComponent;
  baselineOnly: { total: number; wins: number; losses: number; breakEven: number; netR: number };
  ablationOnly: { total: number; wins: number; losses: number; breakEven: number; netR: number };
  inBoth: number;
}

export interface EffectSize {
  ablatedComponent: BiasComponent;
  baselineExpectancyR: number | null;
  ablationExpectancyR: number | null;
  delta: number | null;
  sigma: number | null;
  informative: boolean;
}

export interface AblationStudyResult {
  runs: AblationRunResult[];
  effects: EffectSize[];
  strategyConsistency: StrategyConsistency[];
  pairedOpportunities: PairedOpportunity[];
  isOosBoundary: number;
}

function metricsFrom(analytics: HistoricalBacktestAnalytics | null): AblationMetrics | null {
  if (!analytics) return null;
  return {
    sampleSize: analytics.sampleSize,
    winRate: analytics.winRate,
    expectancyR: analytics.expectancyR,
    averageR: analytics.averageR,
    sharpeR: analytics.sharpeR ?? null,
    profitFactor: analytics.profitFactor,
    maxEquityDrawdownPercent: analytics.maxEquityDrawdownPercent,
  };
}

function robustnessFrom(trades: HistoricalTrade[]): PathRobustnessSummary | null {
  const r = trades.map((t) => t.realizedR);
  if (r.length < 40) return null;
  try {
    const result = pathRobustnessDiagnostic({ returns: r });
    return {
      robustnessScore: result.robustnessScore,
      outOfSampleFailureRate: result.outOfSampleFailureRate,
      meanDegradation: result.meanDegradation,
      observations: result.observations,
    };
  } catch {
    return null;
  }
}

function strategyKey(trade: HistoricalTrade): string {
  return trade.engine.strategyId ?? "LEGACY_UNKNOWN";
}

function bucketExpectancy(trades: HistoricalTrade[]): number | null {
  if (trades.length === 0) return null;
  let sum = 0;
  for (const t of trades) sum += t.realizedR;
  return sum / trades.length;
}

function groupByStrategy(trades: HistoricalTrade[]): Map<string, HistoricalTrade[]> {
  const map = new Map<string, HistoricalTrade[]>();
  for (const t of trades) {
    const key = strategyKey(t);
    const arr = map.get(key);
    if (arr) arr.push(t);
    else map.set(key, [t]);
  }
  return map;
}

function classify(trade: HistoricalTrade): "win" | "loss" | "be" {
  if (trade.realizedPnL > 0) return "win";
  if (trade.realizedPnL < 0) return "loss";
  return "be";
}

function tradeKey(t: HistoricalTrade): string {
  return `${t.symbol}|${t.openedAt}|${t.side}`;
}

function pairedOpportunity(
  component: BiasComponent,
  baselineTrades: HistoricalTrade[],
  ablationTrades: HistoricalTrade[]
): PairedOpportunity {
  const baselineMap = new Map<string, HistoricalTrade>();
  const ablationMap = new Map<string, HistoricalTrade>();
  for (const t of baselineTrades) baselineMap.set(tradeKey(t), t);
  for (const t of ablationTrades) ablationMap.set(tradeKey(t), t);

  const baselineOnly = { total: 0, wins: 0, losses: 0, breakEven: 0, netR: 0 };
  const ablationOnly = { total: 0, wins: 0, losses: 0, breakEven: 0, netR: 0 };
  let inBoth = 0;

  for (const [key, t] of baselineMap) {
    if (ablationMap.has(key)) {
      inBoth += 1;
    } else {
      baselineOnly.total += 1;
      baselineOnly.netR += t.realizedR;
      const cls = classify(t);
      if (cls === "win") baselineOnly.wins += 1;
      else if (cls === "loss") baselineOnly.losses += 1;
      else baselineOnly.breakEven += 1;
    }
  }
  for (const [key, t] of ablationMap) {
    if (!baselineMap.has(key)) {
      ablationOnly.total += 1;
      ablationOnly.netR += t.realizedR;
      const cls = classify(t);
      if (cls === "win") ablationOnly.wins += 1;
      else if (cls === "loss") ablationOnly.losses += 1;
      else ablationOnly.breakEven += 1;
    }
  }

  return { ablatedComponent: component, baselineOnly, ablationOnly, inBoth };
}

async function runOne(
  spec: AblationSpec,
  runConfig: AblationRunConfig,
  startAt: number,
  endAt: number
): Promise<{
  result: AblationRunResult;
  isSummary: HistoricalExecutionSummary | null;
  oosSummary: HistoricalExecutionSummary | null;
}> {
  const overrides: DeepPartial<EngineConfig> = {
    bias: { weights: spec.weights },
  };

  const baseConfig = {
    startAt,
    endAt,
    symbols: runConfig.symbols,
    execution: runConfig.executionConfig,
    engineConfigOverrides: overrides,
  };

  const isRunner = new HistoricalReplayRunner(runConfig.dataset, baseConfig);
  const isRun = await isRunner.run({ collectSteps: false });

  const oosRunner = new HistoricalReplayRunner(runConfig.dataset, baseConfig);
  const oosRun = await oosRunner.run({ collectSteps: false });

  const isTrades = isRun.execution?.trades ?? [];
  const oosTrades = oosRun.execution?.trades ?? [];

  const isMetrics = metricsFrom(
    isRun.execution ? calculateHistoricalAnalytics(isRun.execution) : null
  );
  const oosMetrics = metricsFrom(
    oosRun.execution ? calculateHistoricalAnalytics(oosRun.execution) : null
  );

  const insufficientSample = oosTrades.length < MIN_CONFIG_TRADES;

  return {
    result: {
      id: spec.id,
      label: spec.label,
      ablatedComponent: spec.ablatedComponent,
      isTrades,
      oosTrades,
      isMetrics,
      oosMetrics,
      isRobustness: robustnessFrom(isTrades),
      oosRobustness: robustnessFrom(oosTrades),
      insufficientSample,
    },
    isSummary: isRun.execution,
    oosSummary: oosRun.execution,
  };
}

function buildStrategyConsistency(
  baseline: AblationRunResult,
  ablations: AblationRunResult[],
  sigma: number
): StrategyConsistency[] {
  const baselineGroups = groupByStrategy(baseline.oosTrades);
  const out: StrategyConsistency[] = [];

  for (const ablation of ablations) {
    if (!ablation.ablatedComponent) continue;
    const abGroups = groupByStrategy(ablation.oosTrades);

    const buckets: StrategyBucket[] = [];
    let signAgreement = 0;
    const contradicting: string[] = [];

    for (const [key, baseTrades] of baselineGroups) {
      const abTrades = abGroups.get(key) ?? [];
      if (baseTrades.length < MIN_BUCKET_TRADES || abTrades.length < MIN_BUCKET_TRADES) {
        continue;
      }
      const baseExp = bucketExpectancy(baseTrades);
      const abExp = bucketExpectancy(abTrades);
      if (baseExp === null || abExp === null) continue;

      buckets.push({ key, sampleSize: abTrades.length, expectancyR: abExp });

      const delta = baseExp - abExp;
      if (delta >= 0) signAgreement += 1;
      if (delta <= -2 * sigma) contradicting.push(key);
    }

    const inconclusive = buckets.length < 2;
    out.push({
      ablatedComponent: ablation.ablatedComponent,
      buckets,
      signAgreementCount: signAgreement,
      contradictingBuckets: contradicting,
      consistent: !inconclusive && signAgreement >= 2 && contradicting.length === 0,
      inconclusive,
    });
  }
  return out;
}

function buildEffects(
  baseline: AblationRunResult,
  ablations: AblationRunResult[],
  sigma: number | null
): EffectSize[] {
  const baseExp = baseline.oosMetrics?.expectancyR ?? null;
  return ablations.map((a) => {
    const abExp = a.oosMetrics?.expectancyR ?? null;
    const delta =
      baseExp === null || abExp === null ? null : baseExp - abExp;
    const informative =
      delta !== null && sigma !== null && delta >= 1 * sigma;
    return {
      ablatedComponent: a.ablatedComponent as BiasComponent,
      baselineExpectancyR: baseExp,
      ablationExpectancyR: abExp,
      delta,
      sigma,
      informative,
    };
  });
}

function stddev(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return Math.sqrt(sq / values.length);
}

export async function runBiasAblationStudy(
  config: AblationRunConfig,
  ablations: readonly AblationSpec[] = DEFAULT_ABLATIONS
): Promise<AblationStudyResult> {
  const ratio = config.isOosSplitRatio ?? 0.7;
  if (ratio <= 0 || ratio >= 1) {
    throw new Error("isOosSplitRatio must be in (0, 1).");
  }

  const span = config.endAt - config.startAt;
  if (span <= 0) {
    throw new Error("startAt must be strictly less than endAt.");
  }
  const boundary = Math.floor(config.startAt + span * ratio);

  const baselineSpec = ablations.find((a) => a.id === "baseline");
  if (!baselineSpec) {
    throw new Error("Ablations must include a 'baseline' spec.");
  }
  const ablationSpecs = ablations.filter((a) => a.id !== "baseline");

  const baselineResult = await runOne(
    baselineSpec,
    config,
    config.startAt,
    boundary
  );

  const runs: AblationRunResult[] = [baselineResult.result];
  for (const spec of ablationSpecs) {
    const r = await runOne(spec, config, config.startAt, boundary);
    runs.push(r.result);
  }

  const baselineOosR = baselineResult.result.oosTrades.map((t) => t.realizedR);
  const sigma = stddev(baselineOosR);

  const ablationRuns = runs.filter((r) => r.id !== "baseline");
  const effects = buildEffects(baselineResult.result, ablationRuns, sigma);
  const strategyConsistency = buildStrategyConsistency(
    baselineResult.result,
    ablationRuns,
    sigma ?? 0
  );
  const pairedOpportunities = ablationRuns.map((a) =>
    pairedOpportunity(
      a.ablatedComponent as BiasComponent,
      baselineResult.result.oosTrades,
      a.oosTrades
    )
  );

  return {
    runs,
    effects,
    strategyConsistency,
    pairedOpportunities,
    isOosBoundary: boundary,
  };
}