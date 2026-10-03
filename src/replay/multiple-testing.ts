import type { HistoricalTrade } from "@/replay/execution-types";

/**
 * B3-M4: multiple-testing correction.
 *
 * When a strategy was selected from M parameter combinations, the observed
 * expectancy is biased upward because the best of M samples tends to look
 * better than the true population. The correction implemented here is the
 * standard Bonferroni bound applied to a one-sample t-test of the mean R:
 *
 *   observed_t   = mean(R) / (std(R) / sqrt(N))
 *   required_t(M, alpha) = z(1 - alpha / (2M))
 *
 * The strategy passes when observed_t >= required_t. This is intentionally
 * conservative: Bonferroni assumes the M trials were independent, which is
 * rarely true, so the correction is at worst slightly too strict and never
 * too lax. An over-strict gate is the correct direction for a mechanism
 * that guards live capital.
 *
 * A "trial" is one distinct parameter combination evaluated end to end,
 * including the final chosen configuration. Counting the chosen config is
 * mandatory: excluding it would understate the search.
 */

export interface MultipleTestingResult {
  enabled: boolean;
  numberOfTrials: number;
  alpha: number;
  sampleSize: number;
  observedTStatistic: number | null;
  requiredTStatistic: number | null;
  passed: boolean;
}

/**
 * One-sample t-statistic of the mean R across a trade series.
 * Returns null when the sample is too small or degenerate.
 */
export function observedTStatistic(
  rValues: readonly number[]
): number | null {
  if (rValues.length < 2) return null;
  const mean = rValues.reduce((sum, value) => sum + value, 0) / rValues.length;
  const variance =
    rValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (rValues.length - 1);
  if (!(variance > 0)) return null;
  const standardError = Math.sqrt(variance / rValues.length);
  if (!(standardError > 0)) return null;
  return mean / standardError;
}

/**
 * Two-sided Bonferroni-corrected critical t-statistic.
 *
 * numberOfTrials must be a positive integer. When it is 1 the correction is
 * a no-op and the result equals the standard z at alpha. The function uses
 * the normal approximation to the t-distribution, which is safe here because
 * the caller already enforces a minimum sample size of 30 (see the release
 * gate), well inside the regime where t and z agree to within ~1%.
 */
export function requiredTStatistic(
  numberOfTrials: number,
  alpha: number
): number {
  if (!Number.isInteger(numberOfTrials) || numberOfTrials < 1) {
    throw new Error("numberOfTrials must be a positive integer.");
  }
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= 0.5) {
    throw new Error("alpha must be in (0, 0.5).");
  }
  const tailProbability = alpha / (2 * numberOfTrials);
  return inverseNormalCdf(1 - tailProbability);
}

export function evaluateMultipleTesting(input: {
  trades: readonly HistoricalTrade[];
  numberOfDevelopmentTrials: number;
  alpha: number;
}): MultipleTestingResult {
  const { trades, numberOfDevelopmentTrials, alpha } = input;

  if (numberOfDevelopmentTrials <= 1) {
    return {
      enabled: false,
      numberOfTrials: numberOfDevelopmentTrials,
      alpha,
      sampleSize: trades.length,
      observedTStatistic: null,
      requiredTStatistic: null,
      passed: true,
    };
  }

  const rValues = trades.map((trade) => trade.realizedR);
  const observed = observedTStatistic(rValues);
  const required = requiredTStatistic(numberOfDevelopmentTrials, alpha);
  const passed = observed !== null && observed >= required;

  return {
    enabled: true,
    numberOfTrials: numberOfDevelopmentTrials,
    alpha,
    sampleSize: trades.length,
    observedTStatistic: observed,
    requiredTStatistic: required,
    passed,
  };
}

/**
 * Acklam's inverse normal CDF. Accurate to ~1e-9 over the probability range
 * that matters for Bonferroni-corrected significance (p >= 1e-6). Small,
 * pure, no dependencies.
 */
function inverseNormalCdf(p: number): number {
  if (!(p > 0) || !(p < 1)) {
    throw new Error("inverseNormalCdf domain error: p must be in (0, 1).");
  }
  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
        q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}