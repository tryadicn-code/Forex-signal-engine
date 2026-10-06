# TRD-008 — Reward-to-Risk Baseline

**Status:** documented baseline
**Audit reference:** TRD-008 ("RR 1:2 memang default design")
**Scope:** documentation only; no code, threshold, or trading behaviour is changed.

**Related code:**

- `src/core/config/engine-config.ts`
- `src/core/risk/structural-targets.ts`
- `src/core/strategies/trend-pullback.ts`
- `src/core/strategies/breakout-retest/breakout-retest.ts`
- `src/core/strategies/range-mean-reversion/range-mean-reversion.ts`
- `src/core/strategies/reversal/reversal.ts`

---

## 1. Purpose

This document records the audited reward-to-risk (RR) baseline of the Forex
Signal Engine so that:

- A dashboard signal showing **R:R = 1:2.00** is understood as the intentional
  baseline, not as a bug or an anomaly.
- Any future tuning of `minRR` / `tp2RR` has a written baseline to measure
  against.
- The difference between the **fixed baseline projection** and the
  **structural clearance gate** is explicit and auditable.

This is a documentation artifact. It defines no behaviour; it describes what
the current code already does.

---

## 2. Configuration source of truth

All RR thresholds live in one place: `src/core/config/engine-config.ts`.
risk: {
minRR: 2.0, // hard minimum reward-to-risk
defaultRiskPercent: 0.5, // when caller does not specify
maxRiskPercent: 2.0, // hard ceiling
minRiskPercent: 0.1, // hard floor
maxLotSize: 100, // sanity cap
tp2RR: 3.0, // R multiple for the second target
structuralTargetBufferPips: 2, // clearance buffer in front of swings
}

`assertEngineConfigValid()` enforces the invariant `tp2RR >= minRR` at startup.
A misconfigured override fails immediately, never silently at runtime.

---

## 3. What "RR 1:2" means on the dashboard

When the Risk Engine receives **no explicit targets** (the normal scanner path),
it projects take-profit levels from the stop distance:

- Stop distance: `|entry - setup.invalidationLevel|`
- Target distance: `stopDistance * minRR = stopDistance * 2.0`

The result is the **baseline projection**: every signal that reaches the Risk
Engine without an explicit or structural override is compared against this 2R
floor. This is what produces the recurring "1:2" figure.

The projection is applied uniformly across strategies so that signals from
different regimes remain comparable.

---

## 4. Structural targets as a clearance gate

`deriveStructuralTargetLevels()` builds profit-side obstacle levels from
already-confirmed swing structure:

- Inputs: `setupStructure` (mandatory), `biasStructure` (optional, only when
  the setup and bias timeframes differ).
- For LONG: confirmed swing highs above entry, each buffered **downward** by
  `structuralTargetBufferPips` so that TP never sits exactly on the swing.
- For SHORT: mirror logic on confirmed swing lows.
- Levels are filtered to the profit side, sorted nearest-first, deduped by
  half a pip.
- No look-ahead: `StructureResultData` only exposes swings confirmed by the
  current market boundary.

The nearest obstacle is then used, in `TREND_PULLBACK` and `BREAKOUT_RETEST`,
as a **clearance gate** rather than as a target extension:
minimumTargetDistance = |entry - stop| * minRR
if nearestStructuralTarget is closer than minimumTargetDistance:
targetLevelsForRisk = [nearestStructuralTarget]
else:
targetLevelsForRisk = undefined

Effect:

- Nearest obstacle **inside** the 2R window → passed to the Risk Engine → the
  trade is rejected with `RR_TOO_LOW`.
- Nearest obstacle **outside** the 2R window → `undefined` → baseline 2R
  projection applies.

The baseline is not stretched to the structural level. Structural targets
only **veto** setups whose real room is insufficient.

---

## 5. Per-strategy RR behaviour

| Strategy | Target source |
|---|---|
| `TREND_PULLBACK` | Nearest structural obstacle as a clearance gate; falls back to baseline 2R |
| `BREAKOUT_RETEST` | Same clearance gate as TREND_PULLBACK |
| `REVERSAL` | Structural targets passed nearest-first when they exist; falls back to baseline 2R |
| `RANGE_MEAN_REVERSION` | Range midpoint (TP1) + near-opposite-boundary (TP2); `minRR` still applies |

`RANGE_MEAN_REVERSION` is intentionally different: mean-reversion trades target
the range midpoint and the far boundary. A range whose midpoint cannot satisfy
the shared `minRR` gate is rejected at the Risk Engine.

---

## 6. Second take-profit (TP2)

`tp2RR = 3.0` is used by the Risk Engine to project a second take-profit level
at 3R from entry when the caller does not provide explicit targets. TP1 remains
the baseline or structural level; TP2 is a downstream target consumed by paper
trading and broker execution. The dashboard renders TP1 only.

---

## 7. What this document does NOT say

- It does not claim the 2R baseline is optimal.
- It does not recommend lowering `minRR` to increase signal count.
- It does not recommend raising `minRR` to increase selectivity.
- It does not redefine the audit's Absolute Rule (see the top-level audit
  specification): any change to `minRR` / `tp2RR` is a strategy change and
  requires hypothesis, historical evidence, backtest, out-of-sample
  validation, forward validation, regression tests, and a risk assessment.

---

## 8. Change control

The following values and behaviours are **frozen baseline** until an
explicit, evidence-backed change is approved:

- `risk.minRR`
- `risk.tp2RR`
- `risk.structuralTargetBufferPips`
- The clearance-gate logic in any strategy file
- The range-target model in `RANGE_MEAN_REVERSION`

Recommended process for any change:

1. Write a hypothesis (e.g. "3R baseline improves expectancy in TREND_UP").
2. Gather historical evidence from the signal funnel and replay analytics.
3. Run a backtest with the new value.
4. Run out-of-sample validation.
5. Run forward validation (paper) for a bounded period.
6. Add regression tests covering the new value.
7. Document the risk assessment and rollback plan.

Until that evidence exists, the values in this document are the frozen baseline.

---

## 9. Reference

- Baseline values: `src/core/config/engine-config.ts` (risk section).
- Structural target derivation: `src/core/risk/structural-targets.ts`.
- Clearance-gate usage: `src/core/strategies/trend-pullback.ts`,
  `src/core/strategies/breakout-retest/breakout-retest.ts`.
- Structural target list usage: `src/core/strategies/reversal/reversal.ts`.
- Range target model:
  `src/core/strategies/range-mean-reversion/range-mean-reversion.ts`.