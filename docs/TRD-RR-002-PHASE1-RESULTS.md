# TRD-RR-002 PHASE 1 RESULTS — Obstacle Clearance Gate

Status: EXPERIMENT COMPLETE, doc-only record
Branch: `experiment/rr-obstacle-variants`
Predecessor: `docs/TRD-RR-002-EXPERIMENT-PLAN.md`
Automation: `tests/experiment/rr-obstacle-variants.test.ts`
Run date: 2026-10-12
Run duration: 1h 14m 54s (10 replay runs)

---

## 1. Executive Summary

All 7 config-only variants of the obstacle clearance gate were evaluated against USDJPY + AUDCAD (primary) with USDCAD as conversion-rate auxiliary.

**Outcome: INCONCLUSIVE per EXPERIMENT-PLAN sec.10.**

- All variants produced negative netR in this window (`-4.35R` to `-12.12R`).
- Sample sizes (8-18 closed trades) fall below the 30-trade significance floor.
- No variant cleared the "better than baseline" criteria in sec.10.
- Timezone sensitivity returned identical results across UTC / GMT+2 / GMT+3.
- No `RISK_RR_TOO_LOW` rejections occurred in backtest, contrasting sharply with live (96.9%).

No production change is authorized by this document.

---

## 2. Configuration

| Parameter | Value |
|---|---|
| Primary symbols | USDJPY, AUDCAD |
| Auxiliary (conversion) | USDCAD (D1 only) |
| Account balance | 10,000 |
| Risk per trade | 0.5% |
| Assumed spread | 1.0 pip (applySpread=true) |
| Commission | 0 (assumption) |
| Swap | 0 (assumption) |
| Step timeframe | M15 |
| Execution mode | LIVE |
| Intrabar policy | STOP_FIRST |
| Common window | ~9 months (2025-09 .. 2026-06) |

Timezone server MT5 remains UNVERIFIED. Sensitivity check in sec.5 covers this.

---

## 3. Primary Comparison (UTC offset 0)

| ID | minRR | buffer | orders | filled | rejected | trades | winRate% | PF | expR | netR | maxDD% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A  | 2.00 | 2 | 16 | 13 | 3 | 13 | 23.08 | 0.52 | -0.406 | -5.27 | 3.69 |
| A1 | 1.50 | 2 | 26 | 18 | 8 | 18 | 16.67 | 0.26 | -0.673 | -12.12 | 6.13 |
| A2 | 1.75 | 2 | 20 | 15 | 5 | 15 | 13.33 | 0.24 | -0.728 | -10.92 | 5.53 |
| A3 | 2.25 | 2 | 10 |  9 | 1 |  9 | 11.11 | 0.25 | -0.751 | -6.76 | 4.72 |
| A4 | 2.50 | 2 |  8 |  8 | 0 |  8 | 12.50 | 0.31 | -0.682 | -5.45 | 4.40 |
| A5 | 2.00 | 0 | 18 | 13 | 5 | 13 | 23.08 | 0.53 | -0.405 | -5.27 | 3.69 |
| A6 | 2.00 | 4 | 21 | 15 | 6 | 15 | 26.67 | 0.64 | -0.290 | -4.35 | 4.43 |

**Key patterns:**

1. **Loosening minRR worsens outcomes.** A1 (minRR 1.50) produced -12.12R vs baseline A -5.27R. A2 (1.75) also worse. The clearance gate is not filtering out good trades in this window — it is filtering out bad ones.
2. **Tightening minRR reduces trade count but does not fix negative expectancy.** A4 (2.50) produced only 8 trades with -5.45R.
3. **Buffer sensitivity is mild.** A5 (buffer 0) matches A identically. A6 (buffer 4) is the least-bad variant (PF 0.64, netR -4.35) but still negative.
4. **Trade count asymmetry:** minRR changes affect N proportionally (A1 has 26 orders, A4 has 8). This is expected — minRR affects the gate, derived TP1, clearance window, and veto simultaneously (see EXPERIMENT-PLAN sec.3).

---

## 4. Rejection Breakdown (offset 0)

| Variant | Rejections |
|---|---|
| A  | HISTORICAL_STOP_LOSS_COOLDOWN=1, HISTORICAL_MAX_OPEN_POSITIONS_PER_SYMBOL=2 |
| A1 | HISTORICAL_MAX_OPEN_POSITIONS_PER_SYMBOL=8 |
| A2 | HISTORICAL_MAX_OPEN_POSITIONS_PER_SYMBOL=4, HISTORICAL_STOP_LOSS_COOLDOWN=1 |
| A3 | HISTORICAL_MAX_OPEN_POSITIONS_PER_SYMBOL=1 |
| A4 | (none) |
| A5 | HISTORICAL_MAX_OPEN_POSITIONS_PER_SYMBOL=4, HISTORICAL_STOP_LOSS_COOLDOWN=1 |
| A6 | HISTORICAL_STOP_LOSS_COOLDOWN=1, HISTORICAL_MAX_OPEN_POSITIONS_PER_SYMBOL=5 |

**No `RISK_RR_TOO_LOW` rejections occurred in any variant.**

This is the most surprising finding. Live funnel reports ~96.9% rejection rate from `RISK_RR_TOO_LOW`; the backtest shows zero. The gap is unexplained and remains an open question (sec.8).

All backtest rejections come from execution-layer limits (max open positions per symbol, stop-loss re-entry cooldown), not from the risk gate.

---

## 5. Timezone Sensitivity (variant A only)

| Offset | Label | Orders | Trades | winRate% | PF | expR | netR |
|---|---|---|---|---|---|---|---|
| 0   | UTC   | 16 | 13 | 23.08 | 0.52 | -0.406 | -5.27 |
| 120 | GMT+2 | 16 | 13 | 23.08 | 0.52 | -0.406 | -5.27 |
| 180 | GMT+3 | 16 | 13 | 23.08 | 0.52 | -0.406 | -5.27 |

**Result: identical across all three offsets.**

The `startAt` / `endAt` timestamps shift by exactly 2h and 3h respectively (verified in raw JSON), and candle counts are identical. The strategy's trigger and gate logic is insensitive to a 2-3 hour shift on this dataset.

**Implication:** the "timezone server MT5 UNVERIFIED" blocker from EXPERIMENT-PLAN sec.6 is **not material to variant ranking** on this dataset. It remains a documentation gap, not an experimental one.

Caveat: this does not prove timezone-independence in general. It proves that in this window, with these two symbols, on M15 steps, a 2-3h shift changes nothing. Wider shifts (e.g. GMT+8) or different symbols may behave differently.

---

## 6. Per-Strategy Breakdown (variant A, offset 0)

| Strategy | Trades | winRate% | PF | expR | netR |
|---|---|---|---|---|---|
| TREND_PULLBACK | 8 | 25.00 | 0.60 | -0.327 | -2.61 |
| BREAKOUT_RETEST | 4 | 25.00 | 0.55 | -0.402 | -1.61 |
| RANGE_MEAN_REVERSION | 1 | 0.00 | 0.00 | -1.053 | -1.05 |

REVERSAL produced no trades in this window.

---

## 7. Per-Symbol Breakdown (variant A, offset 0)

| Symbol | Trades | winRate% | PF | expR | netR |
|---|---|---|---|---|---|
| USDJPY | 7 | 42.86 | 1.35 | +0.215 | **+1.51** |
| AUDCAD | 6 | 0.00 | 0.00 | -1.131 | **-6.78** |

**This is the most important finding in the dataset.**

- USDJPY alone: **positive** (PF 1.35, netR +1.51, 42.9% win rate).
- AUDCAD alone: **all losers** (0% WR, netR -6.78).
- Aggregate: negative, driven almost entirely by AUDCAD.

Two hypotheses, neither verified:

1. **AUDCAD is not a suitable pair for this strategy** in this window, possibly due to different structural behavior (commodity currency, thinner liquidity, wider spreads than assumed).
2. **CAD->USD conversion is wrong.** The auxiliary conversion rate is derived from the last USDCAD D1 close, applied statically across the whole run. If the real rate drifted during the window, AUDCAD P&L is biased.

Both hypotheses require a follow-up experiment before any conclusion about AUDCAD's role.

---

## 8. Open Questions

1. **Why does backtest produce zero `RISK_RR_TOO_LOW` rejections?**
   Live: 96.9% of risk-stage rejections are `RISK_RR_TOO_LOW`.
   Backtest: 0 such rejections across all 7 variants, all 10 runs.
   Either (a) live scanner sees opportunities the M15-step backtest does not, (b) the risk gate behaves differently under `executionMode: LIVE` in replay vs production, or (c) the live funnel's "trigger confirmed" population differs structurally from the replay's.

2. **Why is AUDCAD 0% WR?**
   USDJPY positive, AUDCAD all losers. Is the pair unsuitable, is the conversion rate wrong, or is the sample just unlucky?

3. **Is the negative aggregate a dataset artifact?**
   ~9 months, 2 symbols, ~13 trades per variant. Could be regime-specific. A 2-year dataset would help, but is not currently available.

4. **Design B / Design C.**
   Given all variants negative and inconclusive, no evidence supports moving to Design B (RR against TP2) or Design C (tier-aware classifier). Deferred until Q1-Q3 have answers.

---

## 9. Recommendations

1. **No production change.** Consistent with TRD-008 sec.8.
2. **Resolve Q1 and Q2 before any further variant sweep.** More variants on a biased dataset will not help.
3. **EXPERIMENT-PLAN sec.6 (timezone) can be marked resolved** for this dataset.
4. **EXPERIMENT-PLAN sec.7 (cost model)** remains open. Commission and swap were assumed zero; sensitivity bracket was not run in Phase 1.
5. **Phase 2 candidates (not authorized):**
   - Re-run with `executionMode: PAPER` to test hypothesis 2 in sec.8.
   - Add instrument to check whether rejected-but-would-have-won trades exist.
   - AUDCAD-excluded baseline to isolate AUDCAD contribution.

---

## 10. Fact vs Inference

### Observed (from automation output)

- All 7 variants produced negative netR.
- Timezone offsets 0 / 120 / 180 produced identical funnel and analytics for variant A.
- USDJPY positive, AUDCAD negative, at variant A.
- Zero `RISK_RR_TOO_LOW` rejections in any of the 10 replay runs.

### Inference (not directly verified)

- The clearance gate is protective in this window (loosening worsens outcomes).
- AUDCAD's contribution is dominated by a small number of losing trades (6 total).
- Timezone is not material for this strategy on M15 USDJPY/AUDCAD.

### Not verified

- Why live shows 96.9% `RISK_RR_TOO_LOW` and backtest shows 0.
- Whether AUDCAD is fundamentally unsuitable or if the conversion rate is the problem.
- Whether the negative result is regime-specific or persistent.
- Whether Design B or Design C would help.

---

## 11. Change Control

This document records experimental findings only. It authorizes **no** production change.

Any change to `minRR`, `tp2RR`, `structuralTargetBufferPips`, the clearance gate logic, or the range-target model requires the TRD-008 sec.8 seven-step process plus explicit user approval.

---

## 12. Reproducibility

Raw JSON output per variant and run:
`experiments/rr-obstacle-variants/*.json` (gitignored; regenerate via `npm run experiment:rr`).

Automation source: `tests/experiment/rr-obstacle-variants.test.ts`
Helper: `tests/experiment/helpers/load-csv-dataset.ts`
Runner script: `scripts/experiment-rr.ps1`

To reproduce:
1. Place USDJPY, AUDCAD, USDCAD CSVs (D1/H4/H1/M15 for primary; D1 for auxiliary) in `C:\mt5csvexport`.
2. Run `npm run experiment:rr`.
3. Wait ~75 minutes.
4. Review `experiments/rr-obstacle-variants/SUMMARY.md`.