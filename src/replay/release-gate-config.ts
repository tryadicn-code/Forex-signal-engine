/**
 * B3-H3: quantitative thresholds for promoting a backtest to live.
 *
 * These are deliberately conservative defaults tuned for FX strategies. They
 * are not engineering constants: adjust them when the operating regime or the
 * account risk budget changes, but keep them explicit and versioned.
 *
 * A PROMOTE decision is rejected (not just warned) whenever any threshold
 * fails, so an over-optimistic backtest cannot silently graduate to live.
 */
export interface ReleaseGateThresholds {
  /**
   * Minimum number of closed trades in the out-of-sample window
   * (70/30 temporal holdout, latest 30% of the backtest window).
   * 30 is the widely cited floor for Central Limit Theorem approximations
   * to hold on trade P&L distributions.
   */
  minOutOfSampleSampleSize: number;
  /**
   * Minimum out-of-sample expectancy in R multiples. Must be strictly
   * positive: a strategy that cannot beat zero on unseen data does not
   * have a statistical edge worth risking capital on.
   */
  minOutOfSampleExpectancyR: number;
  /**
   * Minimum out-of-sample profit factor. 1.2 provides a modest buffer above
   * break-even (1.0) so a strategy is not promoted on rounding noise.
   */
  minOutOfSampleProfitFactor: number;
  /**
   * Maximum equity drawdown tolerated on the full sample. Uses full-sample
   * DD rather than OOS-only DD because the in-sample window usually contains
   * a stress regime that the OOS window may not have reproduced.
   */
  maxEquityDrawdownPercent: number;
  /**
   * Minimum number of sequential folds (out of 4 by default) that must show
   * positive expectancy. 3 of 4 rules out a strategy that is profitable only
   * in one market regime.
   */
  minPositiveSequentialFolds: number;
  /**
   * When true, any WARNING-severity sample adequacy diagnostic blocks
   * promotion. Sample adequacy already covers N, folds-with-trades, and
   * related structural concerns; making it blocking keeps the gate and the
   * diagnostics layer coherent.
   */
  blockOnSampleWarnings: boolean;
  /**
   * B3-M4: how many distinct parameter combinations were evaluated during
   * development, INCLUDING the final chosen configuration. A value of 1
   * disables the multiple-testing correction and is appropriate only when
   * the strategy was never tuned against the data. Honest reporting is
   * mandatory: understating this number weakens the gate.
   */
  numberOfDevelopmentTrials: number;
  /**
   * B3-M4: significance level for the Bonferroni-corrected t-test. 0.05 is
   * the conventional choice; tightening to 0.01 is reasonable when the
   * strategy is expected to trade a large live account.
   */
  multipleTestingAlpha: number;
}

export const DEFAULT_RELEASE_GATE_THRESHOLDS: ReleaseGateThresholds = {
  minOutOfSampleSampleSize: 30,
  minOutOfSampleExpectancyR: 0,
  minOutOfSampleProfitFactor: 1.2,
  maxEquityDrawdownPercent: 20,
  minPositiveSequentialFolds: 3,
  blockOnSampleWarnings: true,
  numberOfDevelopmentTrials: 1,
  multipleTestingAlpha: 0.05,
};