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
