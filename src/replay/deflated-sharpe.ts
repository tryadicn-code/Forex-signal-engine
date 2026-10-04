/**
 * Deflated Sharpe Ratio (Bailey & Lopez de Prado, 2014).
 *
 * A strategy selected after trying N parameter combinations will have an
 * upward-biased Sharpe ratio even if its true edge is zero. The DSR corrects
 * for that selection bias and for non-normality, returning a probability that
 * the true Sharpe ratio is positive.
 *
 *   SR_0 = sqrt(V) * ((1 - gamma) * Z^-1(1 - 1/N) + gamma * Z^-1(1 - 1/(N*e)))
 *
 *   DSR  = Z[ (SR_hat - SR_0) * sqrt(T - 1)
 *             / sqrt(1 - g3 * SR_hat + ((g4 - 1) / 4) * SR_hat^2) ]
 *
 *   SR_hat  observed per-observation Sharpe ratio (not annualized)
 *   SR_0    expected maximum Sharpe under the null of zero true edge
 *   V       variance of Sharpe across the N trials
 *   gamma   Euler-Mascheroni constant (~0.5772)
 *   e       Euler number (~2.7183)
 *   T       number of return observations
 *   g3      sample skewness of returns
 *   g4      sample kurtosis of returns (not excess; normal = 3)
 *   Z, Z^-1 standard normal CDF and inverse CDF
 *
 * A result of 0.95 means "95% confident the true Sharpe is positive after
 * correcting for the number of trials and for non-normal returns". Bailey
 * and Lopez de Prado recommend requiring DSR >= 0.95 before a strategy is
 * considered significant.
 *
 * This module is pure and has no dependencies outside of Math.
 */

const EULER_MASCHERONI = 0.5772156649015329;

/** Standard normal CDF, Abramowitz & Stegun 26.2.17 (abs error < 1e-7). */
function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * z);
  const poly =
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return x >= 0 ? cdf : 1 - cdf;
}

/** Inverse standard normal CDF, Acklam algorithm (abs error < 1.2e-9). */
function normalInvCdf(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new Error("normalInvCdf requires 0 < p < 1, got " + p);
  }
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function populationStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / values.length);
}

/** Per-observation Sharpe ratio (not annualized). */
export function perObservationSharpe(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const sd = populationStdDev(values);
  if (sd === 0) return 0;
  return m / sd;
}

/** Sample skewness (raw third standardized moment). */
export function sampleSkewness(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  const sd = populationStdDev(values);
  if (sd === 0) return 0;
  let s3 = 0;
  for (const v of values) {
    const z = (v - m) / sd;
    s3 += z * z * z;
  }
  return s3 / n;
}

/** Sample kurtosis (raw fourth standardized moment, normal = 3). */
export function sampleKurtosis(values: number[]): number {
  const n = values.length;
  if (n < 4) return 3;
  const m = mean(values);
  const sd = populationStdDev(values);
  if (sd === 0) return 3;
  let s4 = 0;
  for (const v of values) {
    const z = (v - m) / sd;
    s4 += z * z * z * z;
  }
  return s4 / n;
}

export interface DeflatedSharpeInput {
  /** Per-observation returns. Per-trade R values are a natural choice. */
  returns: number[];
  /** Number of independent parameter combinations tried during development. */
  numberOfTrials: number;
  /**
   * Variance of Sharpe ratios across the N trials. When omitted, a proxy of
   * 1 / (T - 1) is used (variance of Sharpe under i.i.d. normal returns at
   * the null). Supply the actual variance when it is known.
   */
  sharpeVariance?: number;
}

export interface DeflatedSharpeResult {
  observations: number;
  /** Observed per-observation Sharpe ratio, not annualized. */
  sharpeRatio: number;
  /** Expected maximum Sharpe under the null of zero true edge. */
  expectedMaxSharpe: number;
  skewness: number;
  kurtosis: number;
  /** Probability that the true Sharpe ratio is positive after deflation. */
  deflatedSharpe: number;
  probabilityTrueSharpePositive: number;
  trials: number;
  sharpeVariance: number;
  usesEstimatedVariance: boolean;
}

export function deflatedSharpe(
  input: DeflatedSharpeInput
): DeflatedSharpeResult {
  const { returns, numberOfTrials } = input;
  const T = returns.length;

  if (T < 4) {
    throw new Error(
      "Deflated Sharpe requires at least 4 return observations, got " + T + "."
    );
  }
  if (!Number.isInteger(numberOfTrials) || numberOfTrials < 1) {
    throw new Error(
      "numberOfTrials must be a positive integer, got " + numberOfTrials + "."
    );
  }
  for (const r of returns) {
    if (!Number.isFinite(r)) {
      throw new Error("returns must be finite numbers.");
    }
  }

  const sr = perObservationSharpe(returns);
  const g3 = sampleSkewness(returns);
  const g4 = sampleKurtosis(returns);

  const usesEstimatedVariance = input.sharpeVariance === undefined;
  const V =
    input.sharpeVariance !== undefined
      ? input.sharpeVariance
      : 1 / Math.max(1, T - 1);
  if (!Number.isFinite(V) || V < 0) {
    throw new Error(
      "sharpeVariance must be a non-negative finite number, got " + V + "."
    );
  }

  let expectedMaxSharpe: number;
  if (numberOfTrials === 1) {
    expectedMaxSharpe = 0;
  } else {
    const N = numberOfTrials;
    const z1 = normalInvCdf(1 - 1 / N);
    const z2 = normalInvCdf(1 - 1 / (N * Math.E));
    expectedMaxSharpe =
      Math.sqrt(V) *
      ((1 - EULER_MASCHERONI) * z1 + EULER_MASCHERONI * z2);
  }

  const numerator = (sr - expectedMaxSharpe) * Math.sqrt(T - 1);
  const denomSq = 1 - g3 * sr + ((g4 - 1) / 4) * sr * sr;
  if (!(denomSq > 0)) {
    throw new Error(
      "Deflated Sharpe denominator is non-positive (" +
        denomSq.toFixed(6) +
        "); observations are not suitable for the DSR formula."
    );
  }
  const z = numerator / Math.sqrt(denomSq);
  const dsr = normalCdf(z);

  return {
    observations: T,
    sharpeRatio: sr,
    expectedMaxSharpe,
    skewness: g3,
    kurtosis: g4,
    deflatedSharpe: dsr,
    probabilityTrueSharpePositive: dsr,
    trials: numberOfTrials,
    sharpeVariance: V,
    usesEstimatedVariance,
  };
}