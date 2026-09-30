# Phase 7 — Forward Validation & Runtime Drift Monitoring

**Status: COMPLETE**

Phase 7 validates the immutable ACTIVE strategy release against new market data
observed after activation. It uses deterministic Paper Trading evidence and
runtime observations while preserving the Phase 5 historical reference.

Phase 7 does not place real broker orders and does not automatically change,
promote, deprecate or roll back a strategy.

## Phase 7.1 — Release-Bound Forward Identity

Every new Paper order, position and closed trade records:

- strategy semantic version,
- immutable manifest fingerprint,
- source validation report,
- release activation timestamp.

Legacy and unversioned Paper records remain readable but are excluded from
release-scoped forward validation.

The activation timestamp is important because one semantic version can be
active more than once.

Example:

```
v1.0.0 ACTIVE
    ↓
v1.1.0 ACTIVE
    ↓
rollback
    ↓
v1.0.0 ACTIVE again
```

The second v1.0.0 activation is a new forward-validation epoch and is not merged
with the first one.

## Phase 7.2 — Persistent Forward Observation Capture

After each completed ACTIVE-release scan, Phase 7 records a deterministic
observation containing:

- release version/fingerprint/activation epoch,
- observation timestamp,
- provider state,
- symbols requested/successful/failed,
- FRESH/DELAYED/STALE counts,
- engine EXECUTE count,
- lifecycle EXECUTE count,
- new Paper fills,
- new Paper rejections.

Persistence:

```
.data/forward-validation.json
```

Observations are:

- append-only by deterministic observation id,
- deduplicated,
- chronological,
- bounded to the most recent 50,000 observations.

The Paper ledger remains separately stored in:

```
.data/paper-trading.json
```

## Phase 7.3 — Historical vs Forward Analytics

The historical reference is read from the ACTIVE immutable strategy manifest,
not recomputed from mutable source files.

Phase 7 compares:

- sample size,
- win rate,
- profit factor,
- expectancy R,
- average R,
- max drawdown percent,
- net return percent.

Only Paper trades matching all three are included:

```
strategyVersion
manifestFingerprint
activationAt
```

This prevents evidence from different releases, changed manifests or previous
activation epochs from being mixed.

The current cumulative comparison remains available in the forward report and
is also used by the historical validation workbench when the ACTIVE release
originates from that exact historical report.

## Phase 7.4 — Rolling Drift Diagnostics

Cumulative results can hide recent behavior, so Phase 7 uses rolling windows for
active drift indicators.

Default monitoring windows:

```
30 most recent release-scoped closed trades
240 most recent release-scoped scan observations
```

Minimum performance sample:

```
30 closed trades
```

Runtime monitoring states:

- `COLLECTING` — forward sample is still below the minimum,
- `MONITORING` — no monitored indicator is outside its reference/attention
  boundary,
- `ATTENTION` — at least one monitored indicator requires human review.

These are monitoring states, not strategy verdicts.

### Statistical references

Win rate is compared against the historical Wilson 95% interval preserved in
the immutable Phase 5.7 validation summary.

Expectancy R is compared against the historical bootstrap 95% interval.

Forward cumulative-R path drawdown is compared with the historical
trade-order Monte Carlo p95 max-drawdown-R reference.

Possible indicator states:

- `INSUFFICIENT_DATA`
- `WITHIN_REFERENCE`
- `OUTSIDE_REFERENCE`
- `ATTENTION`
- `INFO`

No reference interval is invented when historical diagnostics are unavailable.

## Phase 7.5 — Data & Paper Execution Monitoring

Recent runtime observations also monitor data quality.

Default attention thresholds:

```
provider/symbol failure rate > 5%
stale-data rate             > 5%
```

Paper constraint rejection rate is reported descriptively but is not treated
as broker execution drift because Paper rejections can be caused by expected
portfolio rules such as:

- max open positions,
- total risk cap,
- upstream freshness/risk gates.

Phase 7 records engine EXECUTE, lifecycle EXECUTE, Paper fills and Paper
rejections so the forward audit has operational context.

Real broker fill quality, slippage and latency are still outside scope because
execution remains PAPER.

## Phase 7.6 — UI, API, Export & Hardening

The main scanner dashboard includes:

**Runtime drift monitor**

It shows:

- current Phase 7 status,
- ACTIVE strategy version,
- activation epoch,
- cumulative forward trade count,
- rolling trade count,
- cumulative observation count,
- rolling observation count,
- provider failure rate,
- stale-data rate,
- Paper fills/rejections,
- statistical drift indicators,
- immutable manifest fingerprint.

The monitor refreshes read-only and can export the current report as JSON.

Read-only API:

```
GET /api/forward-validation
```

The Phase 5/Backtest workbench's **Compare with Paper** action now reads this
release-scoped Phase 7 report rather than the whole Paper account.

It refuses the comparison when the ACTIVE release was registered from a
different historical report.

## Historical / Forward Separation

Historical evidence:

```
.data/backtest-runs/
        ↓
immutable strategy manifest
```

Forward evidence:

```
ACTIVE manifest
        ↓
new market scans
        ↓
release-tagged Paper trades
        +
forward observations
        ↓
Phase 7 report
```

Neither side rewrites the other.

## Interaction With Phase 6

Phase 6 still owns:

- ACTIVE release resolution,
- manifest integrity,
- runtime config pinning,
- default-code drift,
- fail-closed release governance,
- controlled rollback.

Phase 7 owns:

- post-activation forward sample identity,
- release-scoped Paper outcome analysis,
- recent performance drift,
- recent data-quality drift,
- forward evidence presentation/export.

Phase 7 never calls the rollback action automatically.

## Known Interpretation Boundaries

Forward Paper results are not live-broker results.

They do not measure:

- real fill latency,
- partial fills,
- broker rejection behavior,
- variable execution slippage,
- real commissions unless explicitly modelled elsewhere,
- infrastructure failures between application and broker.

A metric outside a historical interval can arise from market-regime change,
small-sample noise or implementation/data issues. It is intentionally surfaced
for human review rather than converted into an automatic strategy decision.

## Phase 7 Definition of Done

1. Paper records carry release version identity,
2. Paper records carry manifest fingerprint,
3. Paper records carry source report identity,
4. Paper records carry activation epoch,
5. legacy/unversioned Paper records remain backward compatible,
6. repeated activations of the same version are isolated,
7. each ACTIVE scan creates a release-scoped observation,
8. observations are deterministically deduplicated,
9. observation persistence is bounded and atomic,
10. cumulative forward performance is calculated per release epoch,
11. historical reference comes from the immutable manifest,
12. forward/historical comparison cannot mix different source reports,
13. minimum sample adequacy is explicit,
14. recent 30-trade monitoring prevents old outcomes from hiding new drift,
15. recent observation window monitors current data quality,
16. win rate uses preserved Wilson 95% reference,
17. expectancy R uses preserved bootstrap 95% reference,
18. path drawdown R uses preserved Monte Carlo p95 reference,
19. provider failure rate is monitored,
20. stale-data rate is monitored,
21. Paper constraint rejection rate is visible but not mislabeled as broker drift,
22. monitoring status never changes strategy parameters,
23. monitoring status never promotes a strategy,
24. monitoring status never rolls back a strategy,
25. dashboard exposes Phase 7 evidence,
26. forward report is available over a read-only API,
27. forward report can be exported as JSON,
28. Backtest forward comparison uses the exact ACTIVE release evidence,
29. Phase 1–6 behavior remains covered by regression tests,
30. typecheck, tests, lint and production build pass.

# Phase 7 Completion

**Phase 7 — Forward Validation & Runtime Drift Monitoring is complete.**

The full release-validation chain is now:

```
Historical Data
      ↓
Phase 5 Validation
      ↓
Human PROMOTE
      ↓
Immutable Strategy Version
      ↓
Phase 6 ACTIVE Runtime Pinning
      ↓
New Unseen Market Data
      ↓
Release-Tagged Paper Execution
      ↓
Phase 7 Forward Evidence
      ↓
Rolling Drift Monitoring
      ↓
Human Review
```

The next major milestone is:

**Phase 8 — Production Hardening, Reliability & Recovery**

Phase 8 should focus on durable production infrastructure, recovery,
transactional persistence, observability, deployment safety and operational
failure handling before any real broker execution is considered.
