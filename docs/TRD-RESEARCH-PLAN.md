# TRD Research Plan

**Status:** research plan, no code changes
**Scope:** plan for TRD-006, TRD-007, TRD-009, TRD-010, TRD-011, TRD-012
**Rule:** none of these findings can be implemented as a code change until the full evidence chain exists (hypothesis, historical evidence, backtest, out-of-sample validation, forward validation, regression tests, risk assessment).

This document is the plan for producing that evidence.

## 1. Available tooling

The infrastructure to run these studies already exists. Nothing here is speculative — every study routes through these tools:

- Historical replay: `src/replay/historical-replay-runner.ts`
- Imported-dataset replay: `src/replay/imported-backtest-runner.ts`
- Execution simulator (SL/TP/margin/swap/cooldown): `src/replay/historical-execution-simulator.ts`
- Backtest metrics and PnL: `src/replay/backtest-analytics.ts`
- Statistical diagnostics: `src/replay/statistical-diagnostics.ts`
- Deflated Sharpe Ratio (Bailey & Lopez de Prado): `src/replay/deflated-sharpe.ts`
- Probability of Backtest Overfitting (CSCV): `src/replay/pbo.ts`
- Multiple-testing correction: `src/replay/multiple-testing.ts`
- Robustness validation: `src/replay/robustness-validation.ts`
- Release gate: `src/replay/release-gate.ts`
- Validation workbench: `src/replay/validation-workbench.ts`

No new engine code is added by any study. Research adapters (if any) live outside `src/core/` and are never imported by production paths.

## 2. Common rules

Every study in this document follows the same rules:

1. Data is split into in-sample (IS) and out-of-sample (OOS) before any comparison.
2. Every comparison reports Deflated Sharpe Ratio (DSR) and PBO, not just raw return.
3. A candidate is only "actionable" when it beats the current baseline on OOS by at least 1 standard deviation and has PBO < 0.5.
4. A candidate that clears (3) becomes a **release candidate**, not an automatic change. It still needs forward validation on paper before live activation.
5. Every completed study is documented under `docs/research/` before any implementation PR is opened.

## 3. TRD-006 — Zone selection

**Hypothesis:** The nearest actionable zone is not necessarily the best zone. A selection rule based on structural quality or projected RR yields higher expectancy than nearest-only.

**Data needed:** at least 6 months of H1/M15 candles per pair, at least 6 pairs.

**Method:**
1. Build a research-only Setup adapter that exposes four selection modes: `NEAREST` (current baseline), `HIGHEST_QUALITY`, `BEST_RR`, `STRUCTURE_WEIGHTED`.
2. Replay each mode through `historical-replay-runner` on the IS window.
3. Repeat on OOS.
4. Compare expectancy (R), profit factor, max drawdown, DSR, PBO.

**Success criteria:** one non-baseline mode beats `NEAREST` on OOS expectancy by >=1 sigma, PBO < 0.5, and the advantage persists across at least two regimes.

**Do NOT implement if:** the advantage disappears on OOS, or PBO >= 0.5, or the advantage exists in only one regime.

## 4. TRD-007 — Bias component information gain

**Hypothesis:** The regime component of the bias score contributes less than 5% incremental information gain once structure, trend and momentum are present.

**Data needed:** existing per-symbol bias component breakdowns (`BiasResultData.components`) from any historical replay window.

**Method:**
1. Ablation study: for each component in {structure, trend, regime, momentum}, run replay with that component weight forced to 0.
2. Compare each ablation against the baseline via DSR and PBO.
3. If removing a component does not degrade OOS performance, the component is a candidate for weight reduction.

**Success criteria:** a component whose removal does not degrade OOS by more than 1 sigma becomes a candidate for weight reduction. The reduced weight is chosen from a coarse OOS-optimal grid, not curve-fit.

**Do NOT implement if:** the ablation result depends on regime, or the OOS-optimal weight is a spike with no plateau.

## 5. TRD-009 — TP model comparison

**Hypothesis:** A hybrid model (minimum 2R with structural extension beyond the nearest confirmed obstacle) yields higher expectancy than the current fixed-2R baseline with a structural clearance gate.

**Data needed:** same dataset as TRD-006. The execution simulator already records MFE and MAE per signal.

**Method:**
1. Run three TP configurations through the execution simulator:
   - A: fixed 2R (current baseline).
   - B: structure-aware (TP at nearest confirmed obstacle, no floor).
   - C: hybrid (TP at nearest obstacle if it clears 2R, otherwise 2R).
2. Compare MFE capture ratio, expectancy (R), profit factor, max drawdown, DSR, PBO.

**Success criteria:** hybrid beats baseline on OOS expectancy by >=1 sigma; drawdown does not increase by more than 10% relative; PBO < 0.5.

**Do NOT implement if:** fixed-2R still wins on OOS, or the improvement is concentrated in a single pair.

## 6. TRD-010 — Reversal selectivity

**Hypothesis:** None yet. This is measurement-only.

**What to measure:** qualified reversals divided by HIGH_VOLATILITY occurrences; qualified-to-executable conversion rate; executed reversal win rate and expectancy.

**Method:** over 30+ days count from the signal funnel. If the qualified fraction is below 0.5%, run a replay to see how often a relaxed qualification would have fired and what the outcome was.

**Decision gate:** only if the relaxed variant produces >=1 sigma OOS improvement with PBO < 0.5 do we consider a change. If fewer than 30 qualified reversals exist in the sample, the study is inconclusive and no change is made.

## 7. TRD-011 — Range selectivity

Same structure as TRD-010 but for `RANGE_MEAN_REVERSION`.

**Additional gate:** if total executed range trades in the entire replay window is below 100, the study is inconclusive and no change is made.

## 8. TRD-012 — Breakout anti-chasing validation

**Hypothesis:** The current anti-chasing breakout model (require retest + hold + fresh M15 structure) has higher expectancy than a breakout-chasing model (enter on the breakout candle).

**Method:**
1. Build a research-only breakout-chasing adapter (outside `src/core/`).
2. Replay both models on the same dataset.
3. Compare expectancy, profit factor, DSR, PBO.

**Success criteria:** the anti-chasing model wins on OOS expectancy by >=1 sigma.

**If the anti-chasing model wins:** no change. This is a validation, not a tuning.

**If the chasing model wins:** investigate for look-ahead or overfitting before any consideration.

## 9. Cross-cutting constraints

- No change to `minRR`, `tp2RR`, `minTriggerScore`, or any threshold will be made on the basis of this plan alone.
- No change to regime routing policy (`system-policy.ts`) without the same evidence chain.
- No release will be marked ACTIVE without passing `release-gate.ts`.

## 10. Publication of results

Each completed study is documented in its own file:

    docs/research/TRD-006-zone-selection.md
    docs/research/TRD-007-bias-correlation.md
    docs/research/TRD-009-tp-model.md
    docs/research/TRD-010-reversal.md
    docs/research/TRD-011-range.md
    docs/research/TRD-012-breakout.md

Each file contains: dataset window, in/out split, method, raw results, DSR, PBO, conclusion, and (only if warranted) a recommendation for implementation.

Until a file exists for a finding, that finding is not actionable.