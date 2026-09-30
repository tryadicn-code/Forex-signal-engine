# Phase 5 — Validation / Backtest

## Phase 5.1 — Historical Replay Foundation

Phase 5.1 adds the deterministic historical market-time layer required before a
backtest can be trusted. It does **not** add a second trading strategy and it
does **not** reuse the Phase 4 paper account.

### Architecture

```
Historical canonical candles
        ↓
HistoricalReplayProvider
        ↓
HistoricalReplayClock (market time)
        ↓
HistoricalReplayRunner
        ↓
existing ScannerApi
        ↓
existing FSE Phase 1–4 decision pipeline
        ↓
isolated in-memory replay repositories
```

### Locked boundaries

- Phase 1 strategy logic is reused unchanged.
- Phase 2 scanner/lifecycle logic is reused unchanged.
- Phase 4 PaperTradingService is never invoked by historical replay.
- Replay does not read or write `.data/paper-trading.json`.
- Each replay run owns fresh in-memory scanner repositories.
- No random spread, slippage, fill or price mutation is introduced.
- Historical provider exposes only candles whose **close time <= replay asOf**.
- Replay advances on deterministic closed-bar boundaries, default M15.
- Datasets must already use canonical candles and strictly chronological order.
- Invalid/non-chronological datasets fail instead of being silently repaired.

### Phase 5.1 contracts

#### ReplayDataset

A dataset supplies:
- stable dataset id and optional provenance,
- normalized symbol metadata,
- explicit deterministic spread assumption,
- canonical candles keyed by timeframe,
- optional deterministic account conversion rates.

Vendor-specific import/parsing is intentionally outside the replay engine.

#### HistoricalReplayProvider

Implements the same `MarketDataProvider` contract used by the live scanner.
Every query is bounded by `asOf`, enforcing no-look-ahead at the provider
boundary.

#### HistoricalReplayClock

Creates deterministic market-time analysis anchors. At every anchor only bars
that were closed by that instant may be observed.

#### HistoricalReplayRunner

Creates a new isolated `ScannerApi` and repository bundle per run, then invokes
the existing scanner once for every replay clock step. It can either collect
snapshots or stream steps through a callback for large datasets.

### Explicitly out of scope for 5.1

- historical order/fill simulation,
- historical SL/TP trade lifecycle,
- equity curve,
- drawdown curve,
- performance analytics,
- CSV/MT5/vendor historical import UI,
- parameter optimization,
- walk-forward optimization,
- Monte Carlo simulation,
- broker execution,
- changes to Phase 1–4 decision thresholds.

Those build on top of this deterministic replay foundation.

### Definition of done

Phase 5.1 is complete when:

1. replay runs the existing ScannerApi at deterministic historical timestamps,
2. future candles are impossible to observe before their close time,
3. quote selection also respects the same close-time boundary,
4. separate replay runs do not share scanner repositories,
5. Phase 4 paper storage is not imported or mutated,
6. malformed chronology fails explicitly,
7. replay can stream steps without retaining every snapshot,
8. all legacy Phase 1–4 tests continue to pass,
9. typecheck, tests, lint and production build pass.

### Next planned subphase

**Phase 5.2 — Historical Execution Simulator**

It will consume replay `EXECUTE` decisions and simulate historical position
entry/exit using deterministic OHLC chronology rules, still without touching the
Phase 4 paper account.


---

## Phase 5.2 — Historical Execution Simulator

Phase 5.2 consumes only replay signals that are simultaneously:

- `executionDecision === EXECUTE`
- `signalState === EXECUTE`
- `freshness === FRESH`
- risk-approved with a complete deterministic entry/SL/TP/size snapshot

It creates **historical** orders, positions and trades in memory. These are not
Phase 4 paper orders and never touch the paper store.

### Historical execution chronology

At each replay `asOf` boundary:

1. Existing open historical positions are advanced through newly closed
   execution candles.
2. If an SL/TP is hit, the position is closed at the deterministic level.
3. Realized historical balance is updated.
4. That realized balance is handed back to the existing FSE Risk Engine.
5. The scanner evaluates new signals at the same `asOf`.
6. New valid `EXECUTE` signals may then open historical positions.

This ordering prevents a new signal from using the same candle's earlier
high/low as a post-entry exit and allows historical compounding to use the
correct realized balance.

### Entry model

- Fill price is the Risk Engine's frozen `entryPrice`.
- No random slippage is introduced.
- No random spread is introduced.
- Spread validity remains an upstream FSE execution-gate concern.
- One deterministic `signalId` may create at most one historical order.
- A closed historical signal id is never reopened.

### Exit model

Default execution timeframe: **M15**.

Only candles whose close time is later than `openedAt` may manage that
position. Every unseen eligible candle is processed chronologically.

LONG:
- SL touched when candle low <= stop
- TP touched when candle high >= target

SHORT:
- SL touched when candle high >= stop
- TP touched when candle low <= target

If one OHLC candle touches both SL and TP and intrabar ordering is unknowable,
the policy is configurable:

- `STOP_FIRST` — conservative default
- `TARGET_FIRST`
- `REJECT_AMBIGUOUS` — records an ambiguous-bar close at the stop level

No lower-timeframe guess or fabricated tick ordering is used.

### Historical portfolio guards

Defaults:
- max open positions: 10
- max aggregate open risk: 5% of realized balance

They are configurable in the historical execution config and produce explicit
historical rejection reasons. They do not rewrite or mutate upstream FSE
decisions.

### Historical account model

Phase 5.2 exposes only execution/account facts required for validation:

- initial balance
- realized balance
- equity
- realized P/L
- unrealized P/L
- open risk amount / percent
- historical orders
- open historical positions
- closed historical trades

Advanced performance statistics and comparison views remain a later subphase.

### Isolation guarantees

Phase 5.2 does **not**:

- instantiate `PaperTradingService`
- read or write `.data/paper-trading.json`
- mutate the Phase 4 portfolio
- mutate the Phase 4 journal
- use the live MT5 runtime singleton
- place broker orders
- alter Phase 1 strategy thresholds

The only reused Phase 4 implementation detail is pure tested trade math
(P/L and R calculation); all historical state and lifecycle types are separate.

### Phase 5.2 Definition of done

1. only actionable replay EXECUTE signals can create historical candidates,
2. one signal id creates at most one historical order,
3. malformed execution snapshots fail closed,
4. entry candle cannot close the position it just opened,
5. future candles cannot influence current entry/exit,
6. unseen execution candles are processed in chronological order,
7. LONG and SHORT SL/TP behavior is directionally correct,
8. same-candle SL/TP ambiguity obeys deterministic policy,
9. historical risk caps reject excess exposure,
10. realized balance feeds subsequent Risk Engine sizing,
11. historical positions/trades never touch Phase 4 paper persistence,
12. all Phase 1–4 and Phase 5.1 tests remain green,
13. typecheck, tests, lint and production build pass.

### Next planned subphase

**Phase 5.3 — Backtest Performance Analytics**

This layer will derive equity curve, drawdown curve, expectancy, profit factor,
R distribution, pair/direction/session/setup segmentation and forward-vs-history
comparison from Phase 5.2 historical trades.


---

## Phase 5.3 — Backtest Performance Analytics

Phase 5.3 derives deterministic validation metrics from the Phase 5.2
historical execution state. It does not place trades and does not change any
Phase 1–4 strategy decision.

### Curves

The execution simulator records one mark-to-market point after every replay
step. Phase 5.3 derives:

- realized balance curve,
- mark-to-market equity curve,
- equity peak,
- balance peak,
- equity drawdown amount / percent,
- balance drawdown amount / percent,
- maximum and current equity drawdown.

This distinction is intentional: a backtest can experience a deep floating
drawdown before a position closes, and a realized-only balance curve would hide
that risk.

### Core performance metrics

Historical analytics include:

- sample size,
- wins / losses / break-even,
- win rate / loss rate,
- gross profit / gross loss,
- net P/L and return percent,
- average win / average loss,
- payoff ratio,
- profit factor,
- expectancy in account currency,
- net R,
- average / median / standard deviation of R,
- expectancy R,
- best / worst trade in P/L and R,
- average / median holding time,
- consecutive win / loss streaks,
- maximum/current equity drawdown,
- maximum balance drawdown.

Undefined ratios are represented as `null`, never `Infinity` or `NaN`.
For example, a winning-only sample has no finite profit factor yet.

### R distribution

R results are grouped into deterministic bins so the distribution can later be
visualized without recomputing trading logic in the UI.

### Segmentation

Each closed historical trade is classified by:

- symbol,
- LONG / SHORT direction,
- engine bias label,
- setup-score bucket,
- entry-session bucket,
- close reason.

Every segment includes its own sample size, win/loss counts, win rate, net P/L,
net R, average/expectancy R and profit factor.

#### Session bucket note

The default session classification uses fixed UTC buckets:

- Asia: 00–08 UTC
- London: 08–13 UTC
- London/New York overlap: 13–17 UTC
- New York: 17–22 UTC
- Late: 22–24 UTC

These are deterministic analysis buckets, not a DST-aware exchange calendar.
Custom UTC bucket definitions can be supplied to the analytics function. A
future DST-aware market-session calendar must be introduced explicitly and
versioned because it can change historical segment results.

### Historical vs forward comparison

Phase 5.3 provides a pure comparison helper for normalized performance metrics.
It does **not** read the Phase 4 paper store. A caller may explicitly supply a
forward-test summary and compare:

- sample size,
- win rate,
- profit factor,
- expectancy R,
- average R,
- maximum drawdown percent,
- net return percent.

This preserves the rule that historical validation cannot silently mutate or
depend on Paper Trading persistence.

### Phase 5.3 Definition of done

1. analytics derive only from Phase 5.2 historical state,
2. equity drawdown includes mark-to-market floating P/L,
3. balance drawdown remains separately visible,
4. zero-trade and all-win/all-loss samples never produce NaN/Infinity,
5. expectancy, profit factor and R statistics are unit-tested,
6. R-distribution bins are mutually exclusive,
7. segment sample sizes reconcile with underlying trades,
8. symbol/direction/bias/setup/session/exit segmentation is deterministic,
9. forward comparison is a pure opt-in calculation with no Paper Store access,
10. ReplayRunner returns analytics only when historical execution is enabled,
11. all previous Phase 1–5.2 tests remain green,
12. typecheck, tests, lint and production build pass.

### Next planned subphase

**Phase 5.4 — Historical Data Import & Backtest Run Interface**

This will provide a controlled way to load real historical MT5/CSV data,
validate coverage/quality, configure a replay window, run the backtest and
persist/export the resulting validation report without contaminating the live
or paper runtime.


---

## Phase 5.4 — Historical Data Import & Backtest Run Interface

Phase 5.4 is the controlled entry point for real historical datasets. It sits
outside the live scanner and Phase 4 paper runtime.

### Import contract

The first supported workflow accepts multiple `.csv` or `.txt` files.
Each file name must identify both pair and timeframe, for example:

- `EURUSD_D1.csv`
- `EURUSD_H4.csv`
- `EURUSD_H1.csv`
- `EURUSD_M15.csv`

Every imported pair requires D1, H4, H1 and M15 coverage.

Supported row layouts include:

- MT5-style DATE + TIME + OHLC + volume exports,
- standard CSV with DATETIME/TIMESTAMP + OHLC,
- epoch-second or epoch-millisecond timestamp columns,
- comma, semicolon or tab delimiters.

Historical files are normalized into the same canonical candle type used by
Phase 5.1 before they can reach the replay engine.

### MT5 timezone rule

MT5 exports commonly use broker-server time. Phase 5.4 therefore requires an
explicit source UTC offset in minutes.

Examples:

- `0` = UTC
- `120` = UTC+2
- `180` = UTC+3
- `-300` = UTC-5

Naive DATE/TIME rows are converted to UTC using that declared offset. A
timezone-aware ISO timestamp keeps its own explicit timezone.

The fixed-offset model is intentionally explicit and reproducible. It is not a
DST-aware broker timezone calendar. A DST-aware historical timezone adapter
would need to be versioned separately because it can alter signal timing.

### Dataset validation

Before replay, the importer validates:

- file identity,
- required columns,
- finite/positive OHLC,
- OHLC structural consistency,
- non-negative volume,
- required D1/H4/H1/M15 series,
- common coverage window,
- overlapping duplicate candles,
- conflicting duplicate candles,
- non-weekend gaps,
- deterministic assumed spread.

Identical overlapping candles are de-duplicated with a warning. Conflicting
candles at the same timestamp fail closed.

FX metadata is inferred from a six-letter FX symbol. The report explicitly
warns that pip/lot metadata was inferred so broker-specific constraints can be
reviewed.

### Backtest run configuration

The `/backtest` workstation allows configuration of:

- dataset id/source label,
- source UTC offset,
- deterministic assumed spread,
- optional start/end date,
- initial balance,
- risk percent,
- maximum open positions,
- maximum aggregate risk,
- same-bar SL/TP policy.

Blank start/end uses the common dataset coverage.

The synchronous run interface has a default safety ceiling of **50,000 M15
replay steps**. Larger requested windows fail before scanning so a browser/server
process is not accidentally locked by an oversized replay.

### Server isolation

Historical uploads are processed by Node route handlers. Successful validation
reports are persisted separately under:

```
.data/backtest-runs/
```

That directory is covered by the existing `/.data/` gitignore rule.

Phase 5.4 never reads or writes:

```
.data/paper-trading.json
```

Persisted reports can be listed and reopened by the Backtest interface.

### Backtest report

A successful run stores/returns:

- normalized run configuration,
- dataset validation report,
- historical orders/positions/trades,
- mark-to-market equity history,
- Phase 5.3 analytics,
- pair segmentation,
- run duration and dataset provenance.

The UI can export the complete artifact as JSON.

### UI

The historical interface is available at:

```
/backtest
```

It is visually separated from the live Market Scanner and carries a
`HISTORICAL · BACKTEST` header state.

The workstation shows:

- selected files and total upload size,
- normalization/timezone settings,
- replay/risk settings,
- validation coverage by series,
- blocking errors and warnings,
- core performance metrics,
- mark-to-market equity curve,
- performance by pair,
- persisted recent reports,
- JSON export.

### Safety limits

Current synchronous upload limits:

- 64 files maximum,
- 20 MB maximum per file,
- 128 MB combined upload,
- 50,000 M15 replay steps by default.

These are execution-safety limits for the first interactive interface, not
strategy rules.

### Explicitly out of scope

Phase 5.4 does not add:

- automatic downloading of broker history,
- broker account credentials,
- live broker execution,
- parameter optimization,
- genetic optimization,
- Monte Carlo simulation,
- DST-aware broker timezone reconstruction,
- arbitrary non-FX instrument metadata,
- distributed/background replay workers.

### Phase 5.4 Definition of done

1. MT5/standard CSV historical candles can be normalized into canonical data,
2. naive broker timestamps require an explicit UTC offset,
3. malformed OHLC/time rows fail closed,
4. D1/H4/H1/M15 coverage is validated per pair,
5. exact duplicates are explicitly de-duplicated and conflicting duplicates fail,
6. requested replay windows cannot exceed dataset coverage,
7. oversized synchronous runs are blocked before replay,
8. validated uploads run through the existing 5.1 → 5.2 → 5.3 pipeline,
9. successful reports persist outside Phase 4 paper storage,
10. persisted reports can be listed/reopened,
11. reports can be exported from the UI as JSON,
12. live scanner and paper runtime remain unchanged,
13. all earlier Phase tests remain green,
14. typecheck, tests, lint and production build pass.

### Next planned subphase

**Phase 5.5 — Backtest Validation Workbench & Comparison**

This can add richer comparison views across runs, forward-vs-historical
side-by-side analysis, dataset/run tagging, additional segment filters and
validation-oriented visualizations without changing the strategy itself.


---

## Phase 5.5 — Backtest Validation Workbench & Comparison

Phase 5.5 turns persisted Phase 5.4 reports into a validation workbench. It is
strictly an analysis/organization layer and does not change historical replay,
execution, risk sizing or Phase 1 strategy decisions.

### Report identity

Persisted reports may carry optional user-authored metadata:

- label,
- up to 8 normalized tags,
- metadata update timestamp.

Labels/tags are stored inside the historical report JSON under
`.data/backtest-runs/`. Editing them does not recompute or alter analytics,
trades, configuration or validation evidence.

### Segment explorer

The workbench can inspect the existing Phase 5.3 segment outputs by:

- pair,
- direction,
- bias,
- setup-score bucket,
- entry-session bucket,
- close reason.

The UI never re-runs strategy logic to create these rows; it only selects from
the deterministic analytics already stored in the report. Sample size remains
visible for every subgroup.

### R distribution

The existing mutually-exclusive Phase 5.3 R bins are visualized directly:

- <= -1R,
- -1R to 0R,
- 0R to 1R,
- 1R to 2R,
- >= 2R.

The chart is presentation-only and does not recompute trade outcomes.

### Multi-run comparison

Up to three persisted runs can be selected side-by-side from the lightweight
run index. Comparison columns include:

- sample size,
- win rate,
- profit factor,
- expectancy R,
- average R,
- net return,
- maximum equity drawdown,
- configured risk per trade,
- assumed spread,
- same-bar conflict policy.

The interface deliberately does not assign a score, winner or ranking. The
configuration columns are shown beside performance so users can see when two
runs are not directly comparable.

### Historical vs forward Paper comparison

The workbench can explicitly read the current Phase 4 Paper Trading dashboard
summary and normalize it to the same limited comparison contract as historical
analytics:

- sample size,
- win rate,
- profit factor,
- expectancy R,
- average R,
- max drawdown percent,
- net return percent.

The comparison helper remains pure. It receives already-normalized historical
and forward summaries and returns `Paper - Historical` deltas.

This action is opt-in from the UI. Historical reports and Paper persistence are
never merged or mutated.

### Comparability warning

A numeric delta is descriptive evidence, not proof that one configuration is
better. Different:

- sample sizes,
- market periods/regimes,
- symbols,
- spreads,
- risk settings,
- data sources,
- intrabar policies

can make direct interpretation unreliable. Phase 5.5 surfaces this context
rather than hiding it.

### Phase 5.5 Definition of done

1. persisted reports can be labeled/tagged without modifying results,
2. report list exposes lightweight comparison metrics and configuration context,
3. R distribution can be inspected without recalculating trades,
4. all Phase 5.3 segment dimensions are selectable,
5. up to three persisted runs can be viewed side-by-side,
6. multi-run comparison does not score or rank runs,
7. historical-vs-forward Paper comparison is explicit and read-only,
8. Paper normalization does not access Paper storage directly,
9. report metadata validation fails closed for invalid payloads,
10. existing Phase 5.4 import/replay workflow remains intact,
11. all prior tests remain green,
12. typecheck, tests, lint and production build pass.

### Next planned subphase

**Phase 5.6 — Validation Robustness & Out-of-Sample Testing**

A future subphase can add anchored train/test splits, rolling or walk-forward
validation, parameter/version fingerprints and robustness diagnostics while
keeping strategy changes outside the validation layer.


---

## Phase 5.6 — Validation Robustness & Out-of-Sample Testing

Phase 5.6 adds time-based robustness diagnostics to an already completed
historical report. It does not optimize, retune or select strategy parameters.

### Temporal holdout

The workbench supports deterministic in-sample / out-of-sample splits:

- 60 / 40,
- 70 / 30,
- 80 / 20.

The split is based on market time across the original backtest window.

A closed historical trade is assigned by **entry time**. A position opened
before the OOS boundary remains in-sample even if it closes after the boundary.
This prevents a decision that already existed during development history from
being counted as unseen OOS evidence.

For both periods the workbench reports:

- sample size,
- wins/losses/break-even,
- win rate,
- profit factor,
- net P/L,
- net R,
- average/median R,
- expectancy R,
- maximum consecutive losses.

The displayed OOS-minus-IS deltas are descriptive only.

### Expanding-window sequential validation

The full historical window is divided into `foldCount + 1` sequential time
segments.

For every fold:

1. development history starts at the original backtest start,
2. the development window expands through all earlier segments,
3. validation uses only the next untouched time segment,
4. the fixed FSE strategy is not optimized between folds.

This is expanding-window sequential validation, not walk-forward
optimization.

The workbench exposes each fold's:

- validation dates,
- development sample size,
- validation sample size,
- validation win rate,
- validation profit factor,
- validation expectancy R,
- validation net R.

### Stability diagnostics

Validation folds are summarized descriptively with:

- folds containing trades,
- empty folds,
- positive-expectancy folds,
- non-positive-expectancy folds,
- mean validation expectancy R,
- standard deviation of expectancy R,
- min/max validation expectancy R,
- win-rate standard deviation,
- min/max validation sample size,
- total validation trades.

No robustness score, pass/fail grade or automatic strategy verdict is produced.
Sparse or empty folds remain visible rather than being silently discarded.

### Reproducibility fingerprint

Every opened report can derive three deterministic fingerprints:

- **assumptions** — run configuration, dataset provenance/coverage and the
  centralized FSE engine/scanner configuration snapshot,
- **outcomes** — historical trade outcomes plus core analytics,
- **combined** — assumption + outcome identity.

The fingerprint excludes organizational label/tag metadata, so renaming a
report does not alter reproducibility identity.

The current protocol is:

```
phase-5.6-v1 · fnv1a32x2
```

This is a small deterministic comparison fingerprint, not a cryptographic
security hash.

Because the centralized `defaultEngineConfig`, timeframe roles, signal TTL,
freshness thresholds and candle lookback are part of the assumptions payload,
changing a strategy/scanner threshold automatically changes the assumptions
fingerprint.

### Important interpretation boundary

Phase 5.6 measures temporal consistency of a **fixed** strategy. It does not:

- search for the best parameters,
- optimize thresholds on the in-sample period,
- select a winning fold,
- rank configurations,
- claim statistical significance from a small sample,
- convert OOS diagnostics into an automatic trading recommendation.

If parameter optimization is introduced later, the optimization procedure,
search space and untouched test set must be modeled separately to avoid
selection bias.

### Phase 5.6 Definition of done

1. temporal split is based on time rather than trade count,
2. trades are assigned to IS/OOS by entry time,
3. pre-boundary positions cannot leak into OOS evidence,
4. configurable 60/40, 70/30 and 80/20 holdouts are available,
5. sequential validation uses expanding development + next untouched window,
6. 2–8 sequential folds are supported by the pure validation layer,
7. empty/small folds remain visible,
8. fold stability metrics are descriptive and do not score/rank the strategy,
9. reproducibility fingerprint ignores label/tag metadata,
10. strategy/scanner configuration values are included in the assumptions fingerprint,
11. assumption changes alter the assumptions/combined fingerprint,
12. outcome changes alter the outcomes/combined fingerprint,
13. Phase 1–5.5 logic and persistence remain unchanged,
14. typecheck, tests, lint and production build pass.

### Next planned subphase

**Phase 5.7 — Validation Report Hardening & Statistical Diagnostics**

A later phase can add confidence intervals, bootstrap/Monte Carlo trade-order
diagnostics, minimum-sample warnings and exportable validation summaries while
keeping statistical diagnostics separate from strategy selection.


---

## Phase 5.7 — Validation Report Hardening & Statistical Diagnostics

Phase 5.7 adds deterministic statistical diagnostics to an already completed
historical validation report. It remains an analysis layer only: strategy,
execution, risk sizing and replay behavior are unchanged.

### Win-rate confidence interval

The workbench reports a **95% Wilson interval** for the observed historical win
rate.

Wilson is used instead of a simple normal approximation because it behaves
better for smaller samples and win rates near 0% or 100%.

The interval describes uncertainty in the observed sample. It is not a
guarantee of future win rate.

### Expectancy R bootstrap

Historical realized-R outcomes are resampled **with replacement** using a
deterministic seeded PRNG.

Default:
- 2,000 bootstrap resamples,
- 95% percentile interval for mean/expectancy R,
- fraction of bootstrap resamples whose mean R is above zero.

The positive-resample fraction is deliberately not labeled as a probability of
future profitability. It only describes the generated bootstrap resamples and
inherits all limitations of the original historical sample.

The seed is derived from the Phase 5.6 reproducibility fingerprint so the same
report produces the same bootstrap result.

### Trade-order Monte Carlo

Phase 5.7 also runs deterministic Monte Carlo **trade-order shuffling**.

Each iteration:
1. uses exactly the same realized R outcomes,
2. shuffles them without replacement,
3. preserves terminal Net R,
4. recalculates path-dependent cumulative R drawdown.

The workbench reports:
- observed historical max cumulative R drawdown,
- median shuffled max drawdown,
- P90,
- P95,
- P99,
- worst simulated drawdown.

This measures sensitivity to sequencing only. It does not invent new trades,
change expectancy, simulate broker fills or claim a future drawdown
distribution.

### Minimum-sample warnings

The workbench keeps small samples visible and adds explicit workflow warnings.

Current review thresholds:
- fewer than 30 total closed trades → strong small-sample warning,
- fewer than 100 total trades → limited-sample information,
- fewer than 30 trades in the default 70/30 OOS period → OOS warning,
- any default 4-fold validation window below 10 trades → fold warning.

These thresholds are **workflow review references**, not universal statistical
standards and not automatic strategy pass/fail rules.

### Formal validation summary export

In addition to the complete Phase 5.4 report JSON, Phase 5.7 can export a
compact:

```
<backtest-id>-validation-summary.json
```

The summary contains:
- report identity and tags,
- dataset/source identity,
- run assumptions,
- reproducibility fingerprints,
- core performance metrics,
- fixed 70/30 temporal holdout summary,
- fixed 4-fold sequential-validation summary,
- Phase 5.7 confidence/resampling diagnostics,
- interpretation notes.

The summary protocol is:

```
phase-5.7-v1
```

It is intended for review/audit and comparison without requiring the full
historical order/trade/equity payload.

### Determinism

For the same report:
- trade chronology is sorted before statistical diagnostics,
- bootstrap PRNG seed is deterministic,
- Monte Carlo PRNG seed is deterministic,
- identical assumptions/outcomes produce identical diagnostics,
- changing labels/tags does not change the Phase 5.6 reproducibility
  fingerprint.

### Interpretation limits

Phase 5.7 cannot correct:
- survivorship bias,
- poor or incomplete market data,
- wrong broker timezone assumptions,
- spread-model error,
- same-bar execution-model uncertainty,
- regime mismatch,
- strategy-selection bias,
- parameter overfitting performed outside the validation system.

Confidence intervals and resampling are therefore evidence-quality tools, not
automatic proof of future profitability.

### Phase 5.7 Definition of done

1. win rate exposes a bounded 95% Wilson interval,
2. expectancy R exposes a deterministic 95% bootstrap interval,
3. bootstrap terminology does not imply a future-profit probability,
4. trade-order Monte Carlo preserves realized outcomes and terminal Net R,
5. shuffled drawdown percentiles are deterministic,
6. zero-trade reports produce null diagnostics instead of NaN/Infinity,
7. small full/OOS/fold samples remain visible with explicit warnings,
8. warning thresholds are documented as workflow references only,
9. compact validation summary can be exported from the UI,
10. validation summary includes reproducibility identity and interpretation notes,
11. Phase 5.7 performs no parameter optimization/ranking,
12. Phase 1–5.6 behavior remains unchanged,
13. typecheck, tests, lint and production build pass.

### Next planned subphase

**Phase 5.8 — Validation Evidence Review & Release Gate**

A later phase can consolidate dataset quality, reproducibility, OOS robustness,
statistical warnings and forward-paper evidence into a structured human review
checklist before a strategy/version is promoted, without producing an automatic
trading recommendation.


---

## Phase 5.8 — Validation Evidence Review & Release Gate

Phase 5.8 consolidates the evidence produced by Phase 5.4–5.7 into a
human-controlled review gate. The system can summarize evidence quality and
surface missing/attention items, but it never selects the release decision
automatically.

### Evidence matrix

The gate derives descriptive evidence statuses:

- `SATISFIED`
- `ATTENTION`
- `MISSING`
- `INFO`

Current evidence categories:

- dataset/import validation,
- execution assumptions,
- reproducibility fingerprint,
- 70/30 out-of-sample evidence,
- sequential-validation coverage,
- Phase 5.7 statistical diagnostics/sample warnings,
- optional Phase 4 Paper-forward comparison.

These statuses are review aids only. An `ATTENTION` or `MISSING` item is not
silently converted into a strategy verdict.

### Manual reviewer checklist

The reviewer explicitly records whether they have reviewed:

- dataset quality/import warnings,
- execution assumptions,
- reproducibility identity,
- OOS/sequential evidence,
- statistical diagnostics/sample warnings,
- Forward Paper evidence.

Forward Paper has three review states:

- `NOT_REVIEWED`
- `REVIEWED`
- `WAIVED`

`REVIEWED` requires a captured historical-vs-Paper comparison snapshot.
`WAIVED` records an explicit human decision to continue without Forward Paper
evidence.

### Manual release decision

The stored reviewer decision is one of:

- `PENDING`
- `HOLD`
- `PROMOTE`

The system never chooses among these values.

A `PROMOTE` record is accepted only if:

1. every core manual checklist item has been reviewed,
2. Forward Paper is either `REVIEWED` or explicitly `WAIVED`,
3. the review fingerprint matches the current report,
4. any captured Forward Paper snapshot is bound to the same historical report.

Warnings do not automatically prevent `PROMOTE`; they remain visible so the
reviewer owns the interpretation and decision.

### Fingerprint-bound review

Every saved release review stores the report's current combined
reproducibility fingerprint.

If assumptions or historical outcomes later change, the stored review becomes
`STALE` and must be reviewed again.

Changing organizational metadata such as report labels or tags does not make
the review stale because those fields are excluded from the reproducibility
fingerprint.

### Forward Paper snapshot integrity

When Forward Paper is marked `REVIEWED`, Phase 5.8 stores the comparison
snapshot alongside the manual review.

The historical side of that snapshot must equal the current historical report
metrics. This prevents a comparison from another report/version from being
attached to the current release decision.

### Persistence

The release review is stored inside the existing isolated historical report:

```
.data/backtest-runs/<backtest-id>.json
```

It never writes to:

```
.data/paper-trading.json
```

The recent-report list exposes the saved release decision so reviewed runs can
be identified quickly.

### Release-gate audit export

The UI can export:

```
<backtest-id>-release-gate.json
```

Protocol:

```
phase-5.8-v1
```

The compact audit record contains:

- report id / dataset id,
- current reproducibility fingerprint,
- evidence matrix and status counts,
- stored manual review,
- reviewer checklist,
- Forward Paper snapshot when captured,
- whether the stored review is still current.

This export is intentionally separate from the full historical trade report
and the Phase 5.7 statistical validation summary.

### Phase 5.8 Definition of done

1. evidence from dataset/OOS/sequential/statistical layers is consolidated,
2. evidence statuses remain descriptive rather than becoming an automatic verdict,
3. release decision is always manually entered,
4. PROMOTE requires explicit completion of the core review checklist,
5. Forward Paper must be reviewed or explicitly waived before PROMOTE,
6. reviewed Forward Paper requires a captured comparison snapshot,
7. Forward Paper snapshots must match the current historical report,
8. saved reviews are bound to the current reproducibility fingerprint,
9. changed assumptions/outcomes make the saved review stale,
10. label/tag changes do not invalidate the review,
11. PENDING/HOLD decisions can be saved without pretending evidence is complete,
12. recent reports expose their saved release decision,
13. compact release-gate audit JSON can be exported,
14. Phase 1–5.7 behavior remains unchanged,
15. typecheck, tests, lint and production build pass.

### Next planned subphase

**Phase 5.9 — Validation Governance & Strategy Version Registry**

A later phase can register reviewed strategy versions, preserve immutable
release manifests, track which validation report/fingerprint supports each
version, and record superseded/deprecated versions without introducing live
broker execution or automatic strategy selection.


---

## Phase 5.9 — Validation Governance & Strategy Version Registry

Phase 5.9 closes Phase 5 by converting a manually promoted validation report
into an immutable, auditable strategy-version manifest.

It does not change the strategy and it does not activate broker execution.

### Registration eligibility

A validation report can register a strategy version only when:

1. a Phase 5.8 release review exists,
2. that review is still current for the report fingerprint,
3. the manual reviewer decision is `PROMOTE`.

A `PENDING`, `HOLD`, missing or stale review cannot register a strategy
version.

### Semantic version identity

Versions use canonical semantic format:

```
vMAJOR.MINOR.PATCH
```

Examples:

```
v1.0.0
v1.1.0
v2.0.0
```

Each version is unique inside the registry.

### Immutable strategy manifest

Registration captures a self-contained manifest containing:

- semantic version,
- title and registration note,
- registration actor/time,
- source validation report,
- source dataset and symbols,
- validation window,
- release reviewer/time/fingerprint,
- assumptions/outcomes/combined reproducibility fingerprints,
- full centralized `defaultEngineConfig` snapshot,
- scanner timeframe-role snapshot,
- signal TTL snapshot,
- freshness thresholds,
- candle lookback,
- Phase 5.7 validation summary,
- Phase 5.8 release-gate audit record,
- deterministic manifest fingerprint.

The manifest is never edited after registration.

If any manifest content is changed outside the registry contract, manifest
fingerprint verification fails.

### Registry persistence

The registry is stored separately at:

```
.data/strategy-version-registry.json
```

It does not mutate historical report files or Phase 4 Paper persistence.

### Single ACTIVE version

The registry allows at most one `ACTIVE` strategy version.

If an ACTIVE version already exists, registration of another version must
explicitly declare that exact ACTIVE version as `supersedesVersion`.

The transition is atomic:

```
old ACTIVE
   ↓
SUPERSEDED

new version
   ↓
ACTIVE
```

There is no silent replacement of an ACTIVE version.

### Lifecycle

Supported lifecycle states:

- `ACTIVE`
- `SUPERSEDED`
- `DEPRECATED`

Lifecycle changes are append-only status events containing:

- status,
- timestamp,
- actor,
- reason.

Changing lifecycle status never rewrites the immutable validation manifest.

`DEPRECATED` is terminal in Phase 5.9. Versions are not deleted and cannot be
reactivated through the Phase 5 registry.

### User interface

The Phase 5 workbench exposes a **Strategy Version Registry** panel.

It supports:

- viewing all registered versions,
- seeing ACTIVE/SUPERSEDED/DEPRECATED status,
- registering an eligible promoted report,
- explicitly selecting the version being superseded,
- viewing report/fingerprint provenance,
- viewing status history,
- exporting one immutable strategy manifest as JSON,
- explicitly deprecating a version with actor + reason.

There is intentionally no edit/delete action for manifests.

### Governance boundary

A registered ACTIVE version means:

> this exact strategy/scanner configuration is backed by the attached Phase 5
> validation evidence and has passed the recorded human release review.

It does **not** mean:

- guaranteed profitability,
- live-broker approval,
- automatic production deployment,
- permission to place real orders.

Those belong to later phases.

### Phase 5.9 Definition of done

1. only current manual PROMOTE reports can register a version,
2. strategy version names use canonical semantic versioning,
3. version identifiers are unique,
4. strategy/scanner parameters are frozen into the manifest,
5. validation/release evidence is frozen into the manifest,
6. manifest integrity has its own deterministic fingerprint,
7. manifest content is immutable after registration,
8. registry contains at most one ACTIVE version,
9. replacing ACTIVE requires explicit supersession,
10. supersession is recorded in lifecycle history,
11. deprecation requires actor + reason,
12. lifecycle changes do not mutate manifests,
13. registry persistence is isolated from Paper Trading and backtest reports,
14. registry UI exposes provenance, lifecycle and manifest export,
15. all previous Phase 1–5.8 tests remain green,
16. typecheck, tests, lint and production build pass.

---

# Phase 5 Completion

**Phase 5 — Historical Validation / Backtest is complete after Phase 5.9.**

The completed validation pipeline is:

```
Historical Data Import
        ↓
5.1 Deterministic Historical Replay
        ↓
Existing FSE Strategy Pipeline
        ↓
5.2 Historical Execution
        ↓
5.3 Performance Analytics
        ↓
5.4 Import / Run Interface
        ↓
5.5 Validation Workbench
        ↓
5.6 Robustness & OOS
        ↓
5.7 Statistical Diagnostics
        ↓
5.8 Human Evidence Review / Release Gate
        ↓
5.9 Immutable Strategy Version Registry
```

Phase 5 establishes reproducible historical validation, evidence review and
strategy-version governance. It deliberately ends before live broker execution.

The next major milestone is **Phase 6 — Strategy Governance / Release Runtime**.
