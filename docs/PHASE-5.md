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
