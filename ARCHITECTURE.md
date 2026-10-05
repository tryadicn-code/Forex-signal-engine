# Architecture

The Forex Signal Engine is a **strictly ordered decision pipeline**. Market data
flows in one direction; each stage reads the previous stage's output, adds its
own analysis, and passes a fully explainable result downstream.

```text
Market Data
    |
    v
Market Structure
    |
    v
Market Regime
    |
    v
Bias Engine
    |
    v
Setup Engine
    |
    v
Trigger Engine
    |
    v
Risk Engine
    |
    v
Execution Engine
```

## Layer responsibilities

| Layer               | Responsibility                                                        | Implemented |
| ------------------- | --------------------------------------------------------------------- | :---------: |
| **Market Data**     | Ingest and normalize provider feeds into `MarketDataSnapshot`.        |    yes     |
| **Market Structure**| Detect swing highs/lows, trend structure (HH/HL, LH/LL), S/R levels.   |    yes     |
| **Market Regime**   | Classify the market: trending, ranging, volatile, low liquidity.       |    yes     |
| **Bias Engine**     | Determine directional conviction (bullish/bearish/neutral) + strength. |    yes     |
| **Setup Engine**    | Validate that a tradeable pattern has formed; define entry + invalid.  |    yes     |
| **Trigger Engine**  | Confirm the entry trigger fired (the "when", not the "what").          |    yes     |
| **Risk Engine**     | Enforce risk guards: position sizing, stops, targets, exposure.        |    yes     |
| **Execution Engine**| Decide the outcome (EXECUTE / WAIT / BLOCKED / INVALIDATED).           |    yes     |

## Execution Engine

A **pure decision gate** and the final stage of the pipeline:

```text
decideExecution({ setupValid, triggerTriggered, riskCleared })
```

Priority order (deliberate and tested):

1. **INVALIDATED** - if the setup is no longer valid, the signal is discarded
   regardless of anything else. Broken structure wins every tie.
2. **BLOCKED** - a valid setup that trips a risk guard must never execute.
3. **EXECUTE** - only when setup, trigger, and risk all agree.
4. **WAIT** - the safe default whenever information is incomplete.

The function has no side effects. Broker transmission is handled by the
separately gated Phase 10 execution surface (`src/broker/`); this gate only
decides what *should* happen.

## Separation of concerns

Three boundaries are kept strictly apart:

- **Trading logic** lives in `src/core/`. It is pure TypeScript with no React and
  no network dependency, so it can be unit-tested and later reused by
  backtesting and paper trading without change.
- **UI** lives in `src/components/` and `src/app/`. Components render state;
  they never compute a trading decision.
- **Providers** (market data, broker, notifications) will live in
  `src/providers/` once introduced. They adapt third-party APIs to the domain
  types in `src/types/`, so the engine stays vendor-independent.

## Type contracts

`src/types/market.ts` and `src/types/engine.ts` define the shared vocabulary:
`Candle`, `CandleSeries`, `MarketDataSnapshot`, `BiasDirection`, `MarketRegime`,
and the result interfaces for every pipeline stage. A stage's output type is its
contract with the next stage. Adding a stage means adding a result type and
extending the `StageResult` union.

## Target layout (later phases)

```text
src/
  app/               App Router pages and layouts
  components/        Presentational React components
  core/
    indicators/      Technical indicator calculations
    structure/       Market structure engine
    regime/          Market regime engine
    bias/            Bias engine
    setup/           Setup engine
    trigger/         Trigger engine
    risk/            Risk engine
    execution/       Execution decision gate  <-- exists today
  scanner/           Multi-symbol scanning orchestration
  providers/
    market-data/     Market data provider adapters
    fundamentals/    Fundamental data adapters
    economic-calendar/
    broker/          Broker integration (order routing) - disabled
    notifications/   Telegram / WhatsApp / email - disabled
  backtesting/       Historical replay engine
  paper-trading/     Simulated execution
  lib/               Shared helpers
  types/             Shared domain types
  config/            System and feature configuration
tests/               Mirrors the source tree
```

Empty folders are avoided: each directory above is created only when it contains
real code.


## Current implementation status

The original pipeline diagram in this document describes the canonical
ordering. The implementation has since grown a scanner, paper trading,
historical and forward validation, immutable strategy releases, shared
transactional state, broker execution safety, and realtime alerting. Refer
to README.md "Audit History" for the latest audit pass, and to the per-phase
documents under docs/ for the operational contract of each layer.