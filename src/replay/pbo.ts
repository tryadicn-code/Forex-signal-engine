/**
 * Probability of Backtest Overfitting (PBO) via Combinatorial Symmetric
 * Cross-Validation (CSCV), and a single-strategy path robustness diagnostic.
 *
 * True PBO (Bailey, Borwein, Lopez de Prado, Zhu 2015) requires a matrix of
 * candidate strategies. It answers: when I pick the strategy with the best
 * in-sample Sharpe across N candidates, how often does it land below the
 * median out-of-sample? Our artifacts contain a single strategy, so true PBO
 * cannot be computed from them.
 *
 * This module therefore provides two entry points:
 *
 * 1. probabilityOfBacktestOverfitting(input)
 *    True CSCV over a matrix of strategy return series. Use this when you
 *    run parameter sweeps and want to know how much selection bias you are
 *    exposed to.
 *
 * 2. pathRobustnessDiagnostic(input)
 *    The single-strategy analog. It partitions the return series into S
 *    blocks, evaluates every combination of S/2 blocks as in-sample and the
 *    complement as out-of-sample, and reports how often the out-of-sample
 *    Sharpe is non-positive, how large the in-sample to out-of-sample
 *    degradation is, and how strongly the two are correlated. A strategy
 *    whose sign flips across splits is fragile.
 *
 * Both functions are pure, deterministic, and free of external dependencies.
 */

const DEFAULT_BLOCK_COUNT = 10;
const MAX_BLOCK_COUNT = 14;

// ---------------------------------------------------------------
// Shared math helpers
// ---------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function populationStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / values.length);
}

/** Per-observation Sharpe ratio (not annualized). */
function sharpe(returns: number[]): number {
  if (returns.length === 0) return 0;
  const m = mean(returns);
  const sd = populationStdDev(returns);
  if (sd === 0) return 0;
  return m / sd;
}

/** Pearson correlation. Returns 0 for degenerate inputs (zero variance). */
function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length === 0) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

function subset(arr: number[], indices: number[]): number[] {
  const out: number[] = new Array(indices.length);
  for (let i = 0; i < indices.length; i++) out[i] = arr[indices[i]];
  return out;
}

/** All combinations of k items drawn from {0..n-1}. */
function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const current: number[] = [];
  function recurse(start: number): void {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < n; i++) {
      current.push(i);
      recurse(i + 1);
      current.pop();
    }
  }
  recurse(0);
  return result;
}

/** Split [0..T-1] into S roughly equal consecutive blocks. */
function partitionIndices(T: number, S: number): number[][] {
  const blocks: number[][] = [];
  const baseSize = Math.floor(T / S);
  const remainder = T % S;
  let cursor = 0;
  for (let i = 0; i < S; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    const block: number[] = new Array(size);
    for (let j = 0; j < size; j++) block[j] = cursor + j;
    cursor += size;
    blocks.push(block);
  }
  return blocks;
}

/**
 * Average rank of `target` in `values`, using the Bailey & Lopez de Prado
 * convention: rank 1 = lowest value (worst), rank N = highest value (best).
 *
 * Ties share the average rank (e.g. values [10, 5, 5], target 5 -> 1.5,
 * because the two 5s occupy ranks 1 and 2).
 */
function averageRank(values: number[], target: number): number {
  let lower = 0;
  let equal = 0;
  for (const v of values) {
    if (v < target) lower += 1;
    else if (v === target) equal += 1;
  }
  return lower + (equal + 1) / 2;
}

function validateBlockCount(S: number): void {
  if (!Number.isInteger(S) || S < 4 || S > MAX_BLOCK_COUNT || S % 2 !== 0) {
    throw new Error(
      "blockCount must be an even integer in [4, " + MAX_BLOCK_COUNT + "], got " + S + "."
    );
  }
}

function validateReturns(values: number[], label: string): void {
  for (const v of values) {
    if (!Number.isFinite(v)) {
      throw new Error(label + " must contain finite numbers.");
    }
  }
}

// ---------------------------------------------------------------
// True PBO for multiple strategies
// ---------------------------------------------------------------

export interface PBOInput {
  /**
   * Matrix of per-observation return series. Outer index = strategy.
   * All inner arrays must have the same length.
   */
  strategies: number[][];
  /** Even integer in [4, 14]. Default 10. */
  blockCount?: number;
}

export interface PBOResult {
  strategyCount: number;
  observations: number;
  blockCount: number;
  combinations: number;
  /** Fraction of splits where the best IS strategy fell below median OOS. */
  probabilityOfBacktestOverfitting: number;
  /** Mean of the logit-transformed relative OOS ranks. */
  logitMean: number;
  logitMedian: number;
  logitStdDev: number;
}

export function probabilityOfBacktestOverfitting(
  input: PBOInput
): PBOResult {
  const strategies = input.strategies;
  const N = strategies.length;
  if (N < 2) {
    throw new Error(
      "PBO requires at least 2 strategies, got " + N + ". " +
      "Use pathRobustnessDiagnostic for a single strategy."
    );
  }

  const T = strategies[0].length;
  if (T < 4) {
    throw new Error("PBO requires at least 4 observations, got " + T + ".");
  }
  for (let i = 0; i < N; i++) {
    if (strategies[i].length !== T) {
      throw new Error("All strategies must have the same observation count.");
    }
    validateReturns(strategies[i], "strategies[" + i + "]");
  }

  const S = input.blockCount ?? DEFAULT_BLOCK_COUNT;
  validateBlockCount(S);
  if (T < 2 * S) {
    throw new Error(
      "Not enough observations for CSCV: need T >= 2 * S (" + 2 * S + "), got " + T + "."
    );
  }

  const blocks = partitionIndices(T, S);
  const combos = combinations(S, S / 2);
  const logits: number[] = [];

  for (const isBlocks of combos) {
    const inIs = new Set(isBlocks);
    const isIdx: number[] = [];
    const oosIdx: number[] = [];
    for (let i = 0; i < S; i++) {
      const target = inIs.has(i) ? isIdx : oosIdx;
      for (const idx of blocks[i]) target.push(idx);
    }

    const isSharpe = strategies.map((s) => sharpe(subset(s, isIdx)));
    const oosSharpe = strategies.map((s) => sharpe(subset(s, oosIdx)));

    let best = 0;
    for (let n = 1; n < N; n++) {
      if (isSharpe[n] > isSharpe[best]) best = n;
    }

    const rank = averageRank(oosSharpe, oosSharpe[best]);
    const omega = rank / (N + 1);
    const clamped = Math.max(1e-9, Math.min(1 - 1e-9, omega));
    logits.push(Math.log(clamped / (1 - clamped)));
  }

  const pbo = logits.filter((l) => l <= 0).length / logits.length;

  return {
    strategyCount: N,
    observations: T,
    blockCount: S,
    combinations: combos.length,
    probabilityOfBacktestOverfitting: pbo,
    logitMean: mean(logits),
    logitMedian: median(logits),
    logitStdDev: populationStdDev(logits),
  };
}

// ---------------------------------------------------------------
// Single-strategy path robustness
// ---------------------------------------------------------------

export interface PathRobustnessInput {
  /** Per-observation returns. Per-trade R values are a natural choice. */
  returns: number[];
  /** Even integer in [4, 14]. Default 10. */
  blockCount?: number;
}

export interface PathRobustnessResult {
  observations: number;
  blockCount: number;
  combinations: number;
  inSampleSharpeMean: number;
  inSampleSharpeStdDev: number;
  outOfSampleSharpeMean: number;
  outOfSampleSharpeStdDev: number;
  /** Mean of (IS Sharpe - OOS Sharpe) across splits. Positive = degradation. */
  meanDegradation: number;
  /** Fraction of splits where OOS Sharpe is non-positive. */
  outOfSampleFailureRate: number;
  /** Pearson correlation between IS Sharpe and OOS Sharpe across splits. */
  sharpeCorrelation: number;
  /** Convenience summary in [0, 1]: 1 - failureRate. Higher is better. */
  robustnessScore: number;
}

export function pathRobustnessDiagnostic(
  input: PathRobustnessInput
): PathRobustnessResult {
  const returns = input.returns;
  const T = returns.length;
  if (T < 4) {
    throw new Error(
      "pathRobustnessDiagnostic requires at least 4 observations, got " + T + "."
    );
  }
  validateReturns(returns, "returns");

  const S = input.blockCount ?? DEFAULT_BLOCK_COUNT;
  validateBlockCount(S);
  if (T < 2 * S) {
    throw new Error(
      "Not enough observations: need T >= 2 * S (" + 2 * S + "), got " + T + "."
    );
  }

  const blocks = partitionIndices(T, S);
  const combos = combinations(S, S / 2);
  const isSharpes: number[] = [];
  const oosSharpes: number[] = [];

  for (const isBlocks of combos) {
    const inIs = new Set(isBlocks);
    const isIdx: number[] = [];
    const oosIdx: number[] = [];
    for (let i = 0; i < S; i++) {
      const target = inIs.has(i) ? isIdx : oosIdx;
      for (const idx of blocks[i]) target.push(idx);
    }
    isSharpes.push(sharpe(subset(returns, isIdx)));
    oosSharpes.push(sharpe(subset(returns, oosIdx)));
  }

  const failures = oosSharpes.filter((s) => s <= 0).length;
  const failureRate = failures / oosSharpes.length;

  return {
    observations: T,
    blockCount: S,
    combinations: combos.length,
    inSampleSharpeMean: mean(isSharpes),
    inSampleSharpeStdDev: populationStdDev(isSharpes),
    outOfSampleSharpeMean: mean(oosSharpes),
    outOfSampleSharpeStdDev: populationStdDev(oosSharpes),
    meanDegradation: mean(isSharpes) - mean(oosSharpes),
    outOfSampleFailureRate: failureRate,
    sharpeCorrelation: pearson(isSharpes, oosSharpes),
    robustnessScore: Math.max(0, Math.min(1, 1 - failureRate)),
  };
}