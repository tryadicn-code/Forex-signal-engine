# Real Market Data Integration

This bridge sits between locked Phase 3 and Phase 4. It changes the runtime
market-data source without changing trading strategy logic or enabling orders.

## Provider modes

```text
MARKET_DATA_PROVIDER=mock   -> deterministic offline provider
MARKET_DATA_PROVIDER=oanda  -> OANDA v20 market data
```

Mock remains the default for CI, replay, and deterministic tests.

OANDA mode is market-data only. The application remains `SIGNAL_ONLY`; this
integration does not create, modify, or submit broker orders.

## OANDA practice setup

Create `.env.local` from `.env.example` and set:

```dotenv
MARKET_DATA_PROVIDER=oanda
OANDA_ENVIRONMENT=practice
OANDA_API_TOKEN=<personal access token>
OANDA_ACCOUNT_ID=<practice account id>
```

Do not commit `.env.local`.

The default practice REST base URL is:

```text
https://api-fxpractice.oanda.com
```

The live REST URL is supported by the adapter, but practice should be used for
this pre-Phase-4 acceptance step.

## Runtime path

```text
OANDA REST
  -> OandaMarketDataProvider
  -> canonical closed candles / quote / spread
  -> validation + freshness
  -> D1 / H4 / H1 / M15 context
  -> existing Phase 1 engine
  -> scanner API
  -> dashboard + chart
```

The provider maps internal symbols such as `EURUSD` to OANDA instruments such
as `EUR_USD`, and internal timeframes to OANDA granularities.

## Account-currency conversion

Risk sizing still runs inside the existing pure Risk Engine. Before a live scan,
the server primes the synchronous conversion resolver from real provider quotes.
For a USD account this includes the required USD conversion legs such as
USDJPY/USDCHF/USDCAD and direct GBPUSD/AUDUSD rates. Missing rates stay missing;
the engine is allowed to reject risk rather than use a fabricated fallback.

## Acceptance checks before Phase 4

1. Start with OANDA practice credentials.
2. Run one EURUSD scan and compare the latest closed M15/H1/H4/D1 bars against
   OANDA.
3. Verify dashboard badge reads `LIVE · OANDA`.
4. Verify provider state is CONNECTED and freshness is not stale during an open
   market.
5. Verify chart source reads `OANDA provider`.
6. Verify JPY pairs use 3-digit precision and 0.01 pip size.
7. Verify non-USD quote pairs do not receive a mock conversion rate.
8. Expand to all 13 configured pairs only after the single-pair check passes.

## Rollback

Set:

```dotenv
MARKET_DATA_PROVIDER=mock
```

and restart the Next.js server. No source changes are required.
