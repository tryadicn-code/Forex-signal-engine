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
