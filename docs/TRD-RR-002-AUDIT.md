# TRD-RR-002 — Obstacle Clearance Gate Audit

**Status:** audit complete, read-only
**Branch:** `audit/rr-obstacle-pipeline`
**Parent commit:** `6c8dd96`
**Scope:** documentation only. This document changes no code, threshold, or
trading behaviour.
**Related:** `docs/TRD-008-RR-MODEL.md`

---

## 1. Purpose

Investigate whether the "obstacle-as-veto" behaviour in the production
scanner — where `RISK_RR_TOO_LOW` rejects ~96.9% of confirmed triggers
(3,169 / 3,270 per the 30-day funnel snapshot) — is:

- (a) an unintended side-effect of commit `405df57` ("harden entry quality
  gates"), or
- (b) a deliberate design choice recorded in code and documentation.

The audit is read-only. No source change. No replay. No production
configuration modified.

---

## 2. Method

- Source inspection (read-only) of:
  - `src/core/risk/structural-targets.ts`
  - `src/core/strategies/trend-pullback.ts`
  - `src/core/strategies/breakout-retest/breakout-retest.ts`
  - `src/core/strategies/reversal/reversal.ts`
  - `src/core/strategies/range-mean-reversion/range-mean-reversion.ts`
  - `src/analytics/signal-funnel.ts`
  - `src/replay/execution-types.ts`
- Git archaeology: `git log --follow`, `git log -S "<literal>"`.
- Reference document review: `docs/TRD-008-RR-MODEL.md`.

No replay was executed. No experiment was run. No production config was
changed.

---

## 3. Findings

### 3.1 Origin and commit lineage

The clearance-gate behaviour was NOT introduced by `405df57`.

Commit history for `src/core/strategies/trend-pullback.ts` (oldest to newest
visible):

| Commit | Message |
|---|---|
| `c61c15d` | Use confirmed structure as TP clearance gate |
| `e42feaa` | Keep 2R target behind structural clearance gate |
| `405df57` | feat(strategy): harden entry quality gates |
| `fc5642b` | refactor: extract existing strategy as TREND_PULLBACK |
| `703f240` | refactor: make orchestrator delegate to TREND_PULLBACK |
| `6f62572` | audit(batch1): ... |
| `1682296` | audit(batch1+2): ... |
| `79d48ff` | audit(batch3): ... |
| `8231f00` | audit(batch6-lint): ... |

Key facts:

- `405df57` did **not** touch `trend-pullback.ts`. Its 14-file diff covered
  `engine-config.ts`, `execution-engine.ts`, `veto.ts`, `orchestrator.ts`,
  `regime-engine.ts`, `setup-engine.ts`, `trigger-engine.ts`,
  `scanner-service.ts`, `types/engine.ts`, and four test files.
- The clearance-gate logic predates `405df57`, introduced by the pair
  `c61c15d` + `e42feaa`.
- `fc5642b` extracted the strategy from the orchestrator into a dedicated
  file while preserving semantics (per the source header comment in
  `trend-pullback.ts`).

**Conclusion:** obstacle-as-veto is a pre-existing, deliberate design, not an
artefact of the 405df57 hardening batch.

### 3.2 Per-strategy implementation variance

Three distinct implementations exist, not one.

| Strategy | Behaviour |
|---|---|
| TREND_PULLBACK | Clearance gate. If nearest obstacle sits inside the 2R window, pass `[nearestObstacle]` to the Risk Engine. Else pass `undefined`. |
| BREAKOUT_RETEST | Identical clearance gate to TREND_PULLBACK. |
| REVERSAL | Passes the full structural target list (nearest-first) to the Risk Engine. No `minimumTargetDistance` filter. |
| RANGE_MEAN_REVERSION | Different model. TP1 = range midpoint, TP2 = opposite boundary. Does not use `deriveStructuralTargetLevels`. |

TREND_PULLBACK, BREAKOUT_RETEST, and REVERSAL converge on the same effective
behaviour (RR gate evaluated against the nearest profit-side obstacle) through
different code paths. RANGE_MEAN_REVERSION is intentionally separate.

### 3.3 TRD-008 rationale (documented baseline)

`docs/TRD-008-RR-MODEL.md` explicitly records the design intent:

> "Structural targets only veto setups whose real room is insufficient."

The document lists the following as **frozen baseline** until an
evidence-backed change is approved:

- `risk.minRR`
- `risk.tp2RR`
- `risk.structuralTargetBufferPips`
- The clearance-gate logic in any strategy file
- The range-target model in `RANGE_MEAN_REVERSION`

TRD-008 section 8 prescribes a 7-step change process: hypothesis, historical
evidence, backtest, out-of-sample validation, forward validation, regression
tests, and a risk assessment with rollback plan.

**Conclusion:** the current behaviour is a documented, intentional baseline,
not a defect.

### 3.4 Unverified assumptions

TRD-008 does not present empirical evidence for two load-bearing assumptions:

1. **Every nearest obstacle is a meaningful blocker.** The clearance gate
   treats a fresh minor M15 swing the same as a major H4 swing, unless the
   obstacle falls outside the 2R window. No historical data is cited to
   support that a minor swing is predictive of rejection.
2. **2R is the correct clearance threshold.** The gate uses `minRR = 2.0` as
   the boundary for "obstacle too close". No historical comparison against
   alternative thresholds (1.5R, 2.5R, or tier-aware) is cited.

These are hypotheses that require empirical testing before they can be
confirmed or revised.

---

## 4. Fact vs inference

### Observed from source / git output

- `structural-targets.ts` derives profit-side levels from confirmed swings,
  buffered toward entry, sorted nearest-first, deduped by half a pip.
- TREND_PULLBACK and BREAKOUT_RETEST implement the clearance gate exactly as
  described in section 3.2.
- REVERSAL uses the full structural target list, not the clearance gate.
- RANGE_MEAN_REVERSION uses a different target model.
- `docs/TRD-008-RR-MODEL.md` lists the clearance-gate logic as frozen
  baseline.
- `405df57` did not modify `trend-pullback.ts`.

### Inference (not directly observed)

- The clearance gate was most likely a deliberate reaction to observed
  whipsaw behaviour (near-R2 then reverse to SL), inferred from the commit
  messages `c61c15d` and `e42feaa`.
- The 96.9% risk-stage reject rate is consistent with a clearance gate
  operating in a market where minor swings are dense.

### Not verified

- Whether Design A (current) produces better or worse expectancy than
  Design B (RR against TP2) or Design C (tier-aware clearance).
- Whether obstacle proximity correlates with whipsaw outcome at all.
- Whether the 96.9% reject rate is specific to the recent 30-day window or
  persistent across regimes.

---

## 5. Open questions

1. Does obstacle proximity (in R-units) predict whipsaw outcome in
   historical replay? If not, the clearance gate may be filtering noise.
2. Does the gate reject setups that would have reached 2R before SL, had they
   been allowed? At what rate?
3. Is a single global 2R clearance threshold the right model, or should
   clearance be tiered by timeframe, confluence, and freshness?
4. Does REVERSAL's permissive variant produce different outcomes than
   TREND_PULLBACK's clearance gate?

---

## 6. Recommended experiment (design only)

Baseline: Design A (current production).

Candidates:

| ID | Design | Change |
|---|---|---|
| A | Current | control |
| B | RR gate against TP2 | Use `tp2` instead of `tp1` when computing reward in `risk-engine.ts` |
| C | Tier-aware clearance | Classify obstacle (minor / moderate / major); gate only rejects on moderate+ inside the 2R window |

Metrics, measured on identical dataset, window, and cost assumptions:

- Execution rate (executed / scanned)
- Trade count
- Win rate
- Expectancy in R (after spread, commission, swap)
- Profit factor
- Maximum drawdown
- 2R-hit-before-SL rate
- Separate results per strategy and per obstacle tier

No production change until the experiment completes and is reviewed.

---

## 7. Change control

This audit does NOT authorize any change to `minRR`, `tp2RR`,
`structuralTargetBufferPips`, the clearance-gate logic, or the range-target
model. Any change requires the TRD-008 section 8 process and explicit
approval before implementation.

---

## 8. References

- `docs/TRD-008-RR-MODEL.md`
- `src/core/config/engine-config.ts`
- `src/core/risk/structural-targets.ts`
- `src/core/strategies/trend-pullback.ts`
- `src/core/strategies/breakout-retest/breakout-retest.ts`
- `src/core/strategies/reversal/reversal.ts`
- `src/core/strategies/range-mean-reversion/range-mean-reversion.ts`
- Commits: `c61c15d`, `e42feaa`, `405df57`, `fc5642b`, `703f240`

---

This document is an audit artefact. No code change or trading behaviour is
authorized by it.