# TRD-017 — Freshness Gates: Engine vs Paper

**Status:** documented diagnosis
**Origin:** runtime observation — 0 paper positions opened despite a 24H funnel reporting 75 EXECUTE observations
**Scope:** documentation only. No threshold, no gate, no strategy is changed by this document.

## 1. Observation

Funnel 24H showed 75 EXECUTE observations. Paper trading recorded 2 orders, both REJECTED, and 0 open positions.

## 2. Two different measurements

The funnel and paper count different things:

| Metric | Counts | Unit |
|---|---|---|
| Funnel EXECUTE stage | Every scan cycle where executionDecision === "EXECUTE" | Observation (per scan) |
| Paper orders[] | Every distinct signalId reaching paper | Signal (unique) |

Paper deduplicates by executionKey = "paper:" + signalId. One signal that stays EXECUTE across N cycles produces N funnel observations but only 1 paper order.

75 observations / ~37 cycles per signal = 2 unique signals = 2 paper orders. Consistent.

## 3. Why the two orders were rejected

Both carry rejectionReason: "PAPER_MARKET_DATA_NOT_FRESH".

Paper checks:

    if (result.freshness !== "FRESH") return "PAPER_MARKET_DATA_NOT_FRESH";

result.freshness is the rollup of D1/H4/H1/M15 via rollupFreshness(), which is worst-of: STALE beats DELAYED beats FRESH. One DELAYED timeframe is enough to reject the symbol.

Paper is not broken.

## 4. The real asymmetry

| Layer | FRESH | DELAYED | STALE |
|---|---|---|---|
| Execution engine | EXECUTE | EXECUTE (subject to maxDataAgeMs) | blocked |
| Paper trading | accepts | rejects | rejects |
| Broker (not yet exercised) | TBD | TBD | TBD |

This is intentional fail-closed design. The engine decides "what should happen"; paper simulates execution and must refuse stale fills. The problem is that this asymmetry is undocumented and invisible in the UI.

## 5. Three concrete defects

### Defect A — engineSnapshot() writes a false freshness

In paper-trading-service.ts, engineSnapshot() hardcodes freshness: "FRESH" and executionDecision: "EXECUTE" regardless of what result actually contained. Every order record in .data/paper-trading.json is misleading. Audit trail is unreliable.

### Defect B — downstream rejection is invisible to the funnel

The funnel stops at EXECUTE. Paper and broker outcomes are not represented. A user seeing "75 EXECUTE" has no way to know paper rejected all of them, or why, without opening the JSON file.

### Defect C — the asymmetry is undocumented

No document describes why engine allows DELAYED while paper requires FRESH. Future operators will assume a bug.

## 6. What this document does NOT say

- It does not claim paper is wrong to require FRESH.
- It does not recommend relaxing PAPER_MARKET_DATA_NOT_FRESH.
- It does not recommend changing freshBars, delayedBars, maxDataAgeMs, or rollupFreshness.
- It does not override the audit's Absolute Rule. Any change to a freshness threshold or paper gate requires hypothesis, historical evidence, backtest, out-of-sample validation, forward validation, regression tests, and a risk assessment.

## 7. Proposed changes (plan only)

None of these is implemented by this document.

### Change A — make engineSnapshot() honest

Replace hardcoded values with actual values from result:

    engine.executionDecision = result.executionDecision
    engine.freshness         = result.freshness

One file, one function. No trading logic, no thresholds.

### Change B — surface downstream outcomes in the funnel

Add a downstream stage or a parallel DOWNSTREAM category to signal-funnel.ts that records per observation: paper opened / paper rejected (with reason), broker pending / broker rejected (with reason).

Effect on the dashboard:

    Engine EXECUTE         75
    Paper opened            0
    Paper rejected          2
      NOT_FRESH             2
    Broker pending          0

Analytics layer only.

### Change C — document the freshness contract

This document. It is Change C.

## 8. Recommended order

1. Change C (this document).
2. Change A (engineSnapshot fix) — one-line change, cannot affect live behaviour.
3. Change B (funnel downstream) — additive analytics; design and review like any observability change.

Changes A and B do not touch: src/core, src/core/strategies, src/core/risk, src/broker, src/config/paper.ts, src/config/scanner.ts.

## 9. Change control

Future changes to the following require the full evidence chain: freshBars, delayedBars, rollupFreshness semantics, PAPER_MARKET_DATA_NOT_FRESH, execution.maxDataAgeMs, execution.maxSpreadPips, execution.maxSignalAgeMs. Until evidence exists, current values are the frozen baseline.

## 10. Reference

- src/market-data/freshness.ts
- src/scanner/scanner-service.ts
- src/paper/paper-trading-service.ts
- src/analytics/signal-funnel.ts