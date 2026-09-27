# Phase 2 — Market-Data Provider Layer & Automated Scanner

Phase 2 adds the market-data layer and the automated scanner on top of the locked
Phase 1 strategy engine. Phase 1 is **untouched**: its 120-test baseline still
passes byte-for-byte, and no `src/core` file was modified for Phase 2.

The dependency runs one way only:

```
vendor feed -> provider -> canonical types -> Phase 1 engines -> scanner -> API
```

Nothing in `src/core` imports `src/types/market-data`, `src/providers`,
`src/market-data` or `src/scanner`. Phase 2 adapts to Phase 1; Phase 1 never
adapts to Phase 2.

## Architecture added

### Provider layer
- `src/providers/market-data/provider.ts` — the `MarketDataProvider` interface,
  `CandleRequest` (carrying the `asOf` no-look-ahead boundary) and
  `BaseMarketDataProvider` shared health bookkeeping. A new vendor is added by
  implementing the interface and normalizing into the canonical types; provider
  selection is driven by config (`scanner.providerId`), not by imports.
- `src/providers/market-data/mock-provider.ts` — a deterministic, offline
  provider. Every series is a pure function of `(symbol, timeframe, asOf,
  scenario)`, so a replay at an earlier `asOf` yields strictly the past. It can
  produce trends, ranges, pullbacks, resumptions, staleness, malformed bars and
  outright failure on demand.
- `src/providers/economic-calendar/noop-provider.ts` — the economic-calendar
  **contract only**. No production news API is in scope. The noop reports
  `SKIPPED` and **omits** `newsPending`, so an unchecked news window is never
  mistaken for a confirmed-clear one; the Phase 1 `NEWS_BLOCK` veto stays
  skipped instead of being falsely satisfied.

### Canonical market data
- `src/types/market-data.ts` — `CanonicalCandle`, `SymbolMetadata`,
  `ProviderResult<T>` (discriminated; providers never throw past the boundary),
  `ProviderStatus`, validation/freshness types, `MarketContext` and
  `SignalIdentity`.
- `src/market-data/normalize.ts` — the single place vendor data becomes engine
  data (seconds-vs-ms epochs, missing volume, `closed` derivation).
- `src/market-data/timeframe.ts` — interval math, `candleCloseTime`,
  `alignToClosedCandle`, `closedBarsBefore` (bar counting for TTL).

### Validation layer
- `src/market-data/validate.ts` — per-candle checks (non-finite, bad timestamp,
  duplicate, out-of-order, non-positive price, malformed OHLC) drop the unusable
  candle and record a structured issue; series-level checks cover gaps and
  staleness. `valid` means enough usable candles survived — the full issue list
  is always surfaced, never hidden.
- `src/market-data/closed-candle.ts` — drops unfinished and future bars.

### Freshness model
- `src/market-data/freshness.ts` — age is measured on the **market clock**, and
  thresholds are **timeframe-relative** (a D1 bar hours old is fresh; an M15 bar
  of the same age is stale). **No closed candle is explicitly STALE with an
  infinite age** — the layer never fabricates a market timestamp to make empty
  data look fresh. Rollup takes the worst status, because execution safety
  follows the weakest link.

### Account conversion flow
- `src/market-data/account-conversion.ts` — resolves quote -> account rates from
  real market data (direct quote, or the true inverse). When it cannot resolve a
  rate it says so, and the Risk Engine rejects rather than guessing. The context
  exposes `quoteToAccountConversionRate` only when a conversion was actually
  needed and resolved; same-currency pairs leave it absent.

### Multi-timeframe context
- `src/scanner/market-context.ts` — builds the `MarketContext` per timeframe
  (fetch -> normalize -> closed filter -> freshness -> validation). **All four
  required timeframes (D1, H4, H1, M15) must each contribute enough valid closed
  candles**, otherwise the build returns a structured rejection naming the reason
  (`ALL_TIMEFRAMES_FAILED`, `TIMEFRAME_PROVIDER_FAILURE`, `INSUFFICIENT_BARS`,
  `INVALID_TIMEFRAME_DATA`, `METADATA_UNAVAILABLE`, `MALFORMED_ROLES`) and the
  failing timeframes. Partial context is never passed on. Timeframe isolation is
  enforced: each timeframe owns its own array, `asOf` and freshness.

### Closed-candle / no-look-ahead safety
Only candles whose whole interval elapsed at the analysis time `T` reach the
engines, and the provider boundary carries `asOf` so future bars are rejected at
the source. A replay at an earlier `T` sees strictly the past, which is what
makes the deterministic tests and the TTL bar counting meaningful.

### Scanner service
- `src/scanner/scanner-service.ts` — one cycle across the universe. Per symbol:
  fetch -> normalize -> validate -> closed-candle filter -> freshness -> MTF
  context -> Phase 1 orchestrator -> state derivation -> lifecycle/TTL -> result.
  It contains no strategy logic; it only converts the data layer into Phase 1's
  input and records what the engines concluded.
- **Failure isolation:** every symbol is scanned in its own try/catch and every
  provider call returns a discriminated result, so one pair's dead feed,
  malformed bars or missing timeframe yields a structured failure result for
  that pair and the cycle continues.

### Signal state machine
- `src/scanner/signal-state-machine.ts` — explicit, validated edges only. The
  target state is **derived** from Phase 1 outputs; the machine never re-decides
  a setup, trigger, risk or execution gate. Safety states outrank progress:
  INVALIDATED, then expiry, then BLOCKED. TTL expiry is recorded as a transition
  to the terminal `CLOSED` state with reason `TTL_EXPIRED` (Phase 1's
  `SignalState` has no `EXPIRED` label and Phase 1 is locked, so expiry is
  expressed through `CLOSED` + reason, keeping it distinguishable in history).

### Signal identity
- `src/scanner/signal-lifecycle.ts#computeSignalIdentity` — deterministic
  identity from `symbol + direction + originTimeframe + originTimestamp +
  quantized zone bounds`. Identity follows the **setup**, not the scan: the same
  live setup keeps its id across cycles, and a zone that repeats later in time is
  a new lifecycle. `originTimestamp` is always a real market time (never a price
  or pip value) and no wall-clock value participates.

### Signal TTL
- Bar-aware, not wall-clock: a trigger stays valid for N closed trigger candles
  and a setup for M closed setup candles. `isTriggerExpired` /
  `isSetupExpired` count closed bars on the timeframe being measured.

### Failure isolation & provider health
- `SymbolScanStatus` (`ANALYSED` / `PROVIDER_FAILURE` / `INVALID_DATA` /
  `ANALYSIS_ERROR`) plus per-timeframe rejection reasons make each pair's problem
  explicit. Provider health (`CONNECTED` / `DEGRADED` / `DISCONNECTED`) is
  operational data, kept strictly separate from trading analysis.

### Repository layer
- `src/repositories/types.ts` + `src/repositories/in-memory.ts` —
  `SignalRepository`, `TransitionHistoryRepository`, `SnapshotRepository`,
  `HealthRepository`, with in-memory defaults. Transition history is append-only.
  The scanner depends on the interfaces, never on a storage technology.

### API / service access
- `src/scanner/scanner-api.ts` — the single read-mostly entry point the app uses
  (snapshots, per-symbol results, health, active signals, transition history).
  Accessors return data or null and never throw for a missing scan.

## Deterministic time
Market time is injected as `asOf` and threaded through fetching, validation,
freshness, identity, TTL, state derivation and results. The wall clock is used
only for operational provider health (latency, success/failure instants) — never
for a market decision. A replay at the same `asOf` reproduces identical signal
ids and identical outcomes.

## Files added
```
src/types/market-data.ts
src/config/scanner.ts
src/config/scanner-resolve.ts
src/market-data/{normalize,timeframe,closed-candle,validate,freshness,account-conversion}.ts
src/providers/market-data/{provider,mock-provider}.ts
src/providers/economic-calendar/noop-provider.ts
src/scanner/{market-context,scanner-result,signal-state-machine,signal-lifecycle,scanner-service,scanner-api}.ts
src/repositories/{types,in-memory}.ts
tests/market-data/{freshness,closed-candle}.test.ts
tests/scanner/{market-context,signal-identity,signal-lifecycle-ttl,signal-state-machine,scanner-service,scanner-api}.test.ts
tests/repositories/repositories.test.ts
tests/config/scanner-config.test.ts
tests/providers/economic-calendar.test.ts
docs/PHASE-2.md
```

## Files modified
None in `src/core` (Phase 1 locked). Interrupted Phase 2 writes were repaired in
place: `src/scanner/market-context.ts`, `src/scanner/signal-lifecycle.ts`,
`src/scanner/signal-state-machine.ts`, `src/market-data/freshness.ts`,
`src/providers/economic-calendar/noop-provider.ts`, `src/config/scanner.ts`,
`src/scanner/scanner-result.ts` and `src/types/market-data.ts`.

## Tests added
122 Phase 2 tests covering freshness (including the no-candle STALE regression),
signal identity (same-setup stability, distinct-origin fork, real timestamp),
the required-MTF gate (missing/insufficient/malformed per timeframe), closed
candle and no-look-ahead safety, bar-aware TTL, legal-edge state transitions,
failure isolation, snapshot/health, repositories and the API layer.

## Known limitations
- No production market-data provider; the mock provider is deterministic but
  offline. A vendor implementation is an interface + config change.
- No production economic-calendar provider; news risk is `SKIPPED`, so the
  `NEWS_BLOCK` veto stays skipped rather than evaluated.
- Repositories are in-memory; nothing is persisted across process restarts.
- Phase 2 is `SIGNAL_ONLY`: the pipeline decides and reports, it never places an
  order and never connects a broker.
