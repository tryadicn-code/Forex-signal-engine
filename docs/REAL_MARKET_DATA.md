# Real Market Data Integration

This bridge sits between locked Phase 3 and Phase 4. It changes only the
market-data source. The execution mode remains SIGNAL_ONLY and no broker order
endpoint exists.

## Runtime providers

```text
MarketDataProvider
├── mock   -> deterministic CI / replay / development
├── mt5    -> primary free live feed through local MetaTrader 5
└── oanda  -> optional REST provider
```

## Primary live path: MetaTrader 5

```text
Broker demo/live market feed
        ↓
MetaTrader 5 terminal
        ↓
Python read-only local bridge
        ↓
Mt5MarketDataProvider
        ↓
canonical market data
        ↓
validation / closed-candle safety / freshness
        ↓
D1 / H4 / H1 / M15
        ↓
existing Phase 1 engine
        ↓
scanner + dashboard
```

The bridge binds to `127.0.0.1:8765` by default and exposes only:

- `GET /health`
- `GET /candles`
- `GET /quote`

There are deliberately no order, position, buy, sell, or broker-execution
routes.

## Windows setup

1. Install MetaTrader 5 from the broker you want to use.
2. Open MT5 and log in to a demo account.
3. Keep the terminal running.
4. Install Python 3 for Windows if it is not already installed.
5. In PowerShell from the repository root run:

```powershell
.\scripts\mt5\start-bridge.ps1
```

The script installs the official `MetaTrader5` Python package if necessary and
starts the local read-only bridge.

In a second PowerShell window verify:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
```

A connected terminal should return `connected = True`.

## Forex Signal Engine configuration

Create or replace `.env.local` with the staged EURUSD setup:

```dotenv
MARKET_DATA_PROVIDER=mt5
SCANNER_SYMBOLS=EURUSD
MT5_BRIDGE_URL=http://127.0.0.1:8765
```

Restart Next.js after changing the environment:

```powershell
npm run dev -- -p 3001
```

The dashboard should display `LIVE · MT5`.

## Broker symbol suffixes

Many brokers expose symbols such as `EURUSDm`, `EURUSD.a`, or similar.
The bridge first tries the canonical name and then auto-discovers a symbol
starting with the canonical pair.

For unusual broker naming, the bridge process also accepts:

```powershell
$env:MT5_SYMBOL_PREFIX=""
$env:MT5_SYMBOL_SUFFIX="m"
.\scripts\mt5\start-bridge.ps1
```

These variables belong to the bridge process, not Next.js.

## Staged acceptance

Start with:

```dotenv
SCANNER_SYMBOLS=EURUSD
```

Confirm:

1. Bridge health is connected.
2. Dashboard says `LIVE · MT5`.
3. EURUSD is ANALYSED rather than PROVIDER_FAILURE.
4. D1/H4/H1/M15 each have sufficient closed candles.
5. Freshness is sensible for the current market session.
6. Latest price and spread are plausible compared with the MT5 terminal.
7. Chart, when opened, reports `MT5 provider`.

Then expand to all configured pairs:

```dotenv
SCANNER_SYMBOLS=EURUSD,GBPUSD,USDJPY,USDCHF,AUDUSD,NZDUSD,USDCAD,EURJPY,GBPJPY,EURGBP,AUDJPY,EURAUD,GBPAUD
```

## No-lookahead behavior

The bridge receives the scanner's `asOf` time. It returns only bars whose full
timeframe interval has closed by that time. Latest quote requests use a current
tick only when it is at or before `asOf` and recent; otherwise the bridge
derives an as-of quote from completed M1 market data.

## Account-currency conversion

Before each scan, the server primes the existing synchronous conversion resolver
from the active live provider. Missing conversion rates remain missing so the
Risk Engine can reject rather than use a fabricated fallback.

## Rollback

To return to deterministic mock data:

```dotenv
MARKET_DATA_PROVIDER=mock
SCANNER_SYMBOLS=EURUSD
```

Restart Next.js. No source change is required.
