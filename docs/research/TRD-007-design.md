# TRD-007 - Bias Component Information Gain (Design)

**Status:** design, no code changes yet
**Scope:** ablation study for the four bias components
**Related:** `docs/TRD-RESEARCH-PLAN.md` section 4, `src/core/bias/bias-engine.ts`

## 1. Hypothesis

H1: removing the `regime` component from the bias score does not materially
degrade out-of-sample expectancy relative to baseline, after accounting for
sample size, regime coverage, and robustness diagnostics.

The original "less than 5 percent incremental information" framing is
retained only as a secondary descriptive metric, not as the acceptance
criterion.

`bias-engine.ts` already documents that `regime` double counts information
from `structure` and `trend` because the Regime Engine itself consumes the
EMA stack and market structure. H1 tests whether that correlation is
harmful to expectancy, not whether it exists.

## 2. Dataset requirements

- At least 6 months of D1/H4/H1/M15 candles per symbol
- At least 6 symbols from SUPPORTED_SYMBOL_UNIVERSE
- Static spread per symbol via ReplaySymbolData.spreadPips
- CSV import via importHistoricalCsvFiles

Dataset not yet in repo. The study itself runs in a separate session once
CSV is provided; this session only ships the harness plus this design.

## 3. Fixed replay environment

Every configuration shares:

- same dataset, same symbols
- same spread assumption
- same execution config (SL/TP/margin/swap/cooldown)
- same deterministic seed where applicable
- same IS/OOS boundary

IS/OOS boundary: chronological 70/30 split by M15 asOf timestamp. The
boundary is fixed before any replay runs.

## 4. Ablation configurations

| ID               | structure | trend | regime | momentum | sum |
|------------------|-----------|-------|--------|----------|-----|
| baseline         | 35        | 25    | 20     | 20       | 100 |
| ablate-structure | 0         | 25    | 20     | 20       | 65  |
| ablate-trend     | 35        | 0     | 20     | 20       | 75  |
| ablate-regime    | 35        | 25    | 0      | 20       | 80  |
| ablate-momentum  | 35        | 25    | 20     | 0        | 80  |

Injected via `ReplayRunConfig.engineConfigOverrides.bias.weights`.
`analyzeBias` renormalizes by totalWeight, so ablation is a true removal,
not a rescale.

## 5. Metrics per configuration

From `calculateHistoricalAnalytics` on both IS and OOS:

- sampleSize, winRate
- expectancyR, averageR
- sharpeR, sortinoR
- profitFactor
- maxEquityDrawdownPercent
- DSR via `deflated-sharpe.ts`

### 5.1 Robustness: pathRobustness per configuration, not PBO across configs

True CSCV PBO (`probabilityOfBacktestOverfitting`) requires a matrix of
strategies with equal observation counts. Ablation configs produce
different trade counts because removing a bias component changes the
signal mix and therefore the number of executed trades. A PBO matrix
across the 5 configurations is therefore not computable from this study's
artifacts.

Instead, each configuration receives an independent robustness diagnostic
via `pathRobustnessDiagnostic` (single-strategy analog of PBO). The
diagnostic reports:

- in-sample vs out-of-sample Sharpe means
- mean degradation (IS Sharpe minus OOS Sharpe)
- out-of-sample failure rate
- robustness score in [0, 1]

This limitation is documented, not worked around. Any report on TRD-007
must state "path robustness diagnostic" and must not claim "PBO" for
ablation comparisons.

### 5.2 Sigma is an exploratory effect-size gate, not significance

sigma = population standard deviation of the per-trade R series of the
baseline OOS run.

Effect size: delta = expectancyR(baseline, OOS) - expectancyR(ablate_C, OOS).

Gate: delta >= 1 * sigma marks the ablation as informative.

This is an exploratory effect-size gate. It is NOT a statistical
significance test and must never be described as one in any report. The
label used in the results document is fixed as "exploratory effect-size
gate".

### 5.3 Minimum sample per configuration

Minimum OOS trades per configuration: 30.
Minimum OOS trades per strategy bucket: 20.

Any configuration below the threshold is marked INSUFFICIENT_SAMPLE and
cannot produce a recommendation.

## 6. Strategy consistency (strategyId proxy for regime)

`HistoricalEngineSnapshot` records `strategyId` but not `regime`. The
strategy router maps regime to strategy as follows:

- TREND_UP, TREND_DOWN, STRONG_TREND_UP, STRONG_TREND_DOWN -> TREND_PULLBACK
- BREAKOUT -> BREAKOUT_RETEST
- RANGE -> RANGE_MEAN_REVERSION
- HIGH_VOLATILITY -> CONDITIONAL_REVERSAL
- LOW_VOLATILITY -> WAIT (no trades)

Therefore `strategyId` collapses TREND_UP and TREND_DOWN into a single
bucket. It is a coarse proxy, documented here rather than worked around.
Recording the regime label directly would require an additive change to
`src/replay/execution-types.ts` and is deferred to a follow-up if the
study results justify it.

For each configuration on OOS:

1. Group trades by `engine.strategyId` (fall back to LEGACY_UNKNOWN).
2. Discard buckets with fewer than 20 trades.
3. Compute expectancyR per remaining bucket.
4. Compute the sign of delta(baseline - ablation) per remaining bucket.

A finding is "consistent" when at least 2 strategy buckets agree on the
sign of delta AND no bucket shows delta with magnitude >= 2 * sigma in
the opposite direction.

If fewer than 2 buckets clear the minimum trade count, the result for
that component is INCONCLUSIVE.

## 7. Paired opportunity analysis

Because baseline and ablations share dataset, timestamp, pipeline and
risk config, trades are matched across runs by
(symbol, openedAt, direction).

Per ablation, report:

- trades in baseline only
- trades in ablation only
- trades in both
- for baseline-only trades: win/loss/BE breakdown and net R
- for ablation-only trades: win/loss/BE breakdown and net R

This answers "what does this component actually add or remove" at the
trade level, not just at the mean level.

## 8. Decision gates

For each component C:

- PRESERVE when delta >= 1 * sigma OR inconsistent across strategy buckets.
- CANDIDATE FOR REDUCTION when delta < 1 * sigma AND path robustness
  score >= 0.5 AND consistent across at least 2 strategy buckets AND
  paired analysis shows no material loss of winning trades.
- INCONCLUSIVE when any config is INSUFFICIENT_SAMPLE, robustness score
  < 0.5, or fewer than 2 strategy buckets clear the minimum.

No component is ever marked REMOVE by this study. Reduction is the
strongest outcome it can produce.

## 9. Non-goals

- No change to `src/core/**`.
- No curve-fitting of weights. Recommendations are removal or coarse grid
  reduction only, never tuned values.
- No automatic activation. Any candidate must pass forward validation on
  paper before touching production `bias.weights`.
- No modification of minRR, tp2RR, minTriggerScore, or any threshold
  outside bias.weights.
- No "statistical significance" claims. Results use "exploratory effect
  size" vocabulary.
- No claim of "PBO" for ablation comparisons. Per-config robustness uses
  `pathRobustnessDiagnostic`.

## 10. Deliverables

1. ReplayRunConfig.engineConfigOverrides (types.ts, additive)
2. Runner propagation (historical-replay-runner.ts, additive)
3. src/replay/research/bias-ablation.ts (new)
4. tests/replay/research/bias-ablation.test.ts (new)
5. docs/research/TRD-007-bias-correlation.md (stub, filled at study time)

## 11. Publication

Results go to `docs/research/TRD-007-bias-correlation.md` with: dataset
window, IS/OOS split, per-configuration metrics, per-config path
robustness, sigma and delta per ablation, strategy consistency table,
paired opportunity table, conclusion, recommendation (PRESERVE /
CANDIDATE FOR REDUCTION / INCONCLUSIVE).