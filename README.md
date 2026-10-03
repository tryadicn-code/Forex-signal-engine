# Forex Signal Engine

Automated **Forex scanner + signal dashboard**. The system ingests market data,
runs it through a strictly ordered decision pipeline, and emits explainable
trade signals.

> **Status: Phase 11 — Realtime Alerting & Notification Infrastructure COMPLETE.**
> The project includes the core strategy engine, scanner/dashboard, deterministic
> Paper Trading, historical + forward validation, immutable strategy releases,
> production recovery, shared transactional persistence, broker execution safety,
> and durable Telegram/WhatsApp alerting for scanner lifecycle events.
> Notifications are observer-only and disabled by default; broker execution also
> remains OFF by default unless explicitly configured and armed.

## Pipeline

```text
Market Data -> Structure -> Regime -> Bias -> Setup -> Trigger -> Risk -> Execution
```

Every stage is explainable: each decision carries the reasons that produced it.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for the responsibility of each layer.

## Tech stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS** for styling
- **ESLint** for linting
- **Vitest** + **Testing Library** for tests
- **PostgreSQL/PostgREST-compatible transactional backend** is supported in
  Phase 9 without adding a database SDK dependency to the application.
- **MetaTrader 5 bridge** supports market data and a separately gated Phase 10
  broker execution surface.
- Prisma and TradingView Lightweight Charts are not installed.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local   # then edit .env.local
# (Windows PowerShell: Copy-Item .env.example .env.local)

# 3. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the scanner/dashboard
and [http://localhost:3000/backtest](http://localhost:3000/backtest) for the
Phase 5 historical validation workbench.

## Development commands

| Command              | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the development server                 |
| `npm run build`      | Production build                             |
| `npm run start`      | Serve the production build                   |
| `npm run lint`       | Run ESLint                                   |
| `npm run typecheck`  | Run `tsc --noEmit` (no JS output)            |
| `npm test`           | Run the test suite once                      |
| `npm run test:watch` | Run tests in watch mode                      |
| `npm run coverage`   | Run tests with a coverage report             |

## Project structure

```text
src/
  app/              Next.js App Router pages and layouts
  components/        React components (UI only - no trading logic)
  config/           System and feature configuration
  core/              Trading engine pipeline (decision logic)
    execution/       Execution decision gate
  broker/            Phase 10 broker contracts, safety coordinator and stores
  notifications/     Phase 11 alert detection, durable outbox and channel adapters
  lib/               Small shared helpers
  types/             Shared domain types (provider-agnostic)
tests/               Test suite mirroring the source tree
```

The repository now contains provider, scanner, Paper Trading, historical
validation, release-runtime governance, forward-validation, local reliability,
shared transactional infrastructure, the Phase 10 broker execution safety
layer, and Phase 11 realtime alerting. Alerts are persisted independently from
trading state and delivered by a separate worker so notification provider
failures cannot change or delay trading decisions.

## Engineering principles

- **Modular** - one responsibility per module, no god files.
- **Strongly typed** - shared domain types are the contract between layers.
- **Testable** - engine logic is pure functions, easy to unit test.
- **Provider-agnostic** - market data is normalized before engines see it.
- **Explainable** - every decision records why it was made.
- **Separated concerns** - trading logic never lives in React components; market
  data providers and broker integration stay independent of the engine.

## Scope guardrails

The FSE can scan, validate signals, simulate Paper Trading, run deterministic
historical validation, operate under an immutable ACTIVE strategy release,
monitor forward drift, coordinate shared multi-instance state, evaluate broker
orders in SHADOW mode, and—only under explicit Phase 10 gates—transmit an
eligible order through a configured broker adapter. LIVE is not a default state:
the environment gate, emergency stop, shared-state requirement, persistent
kill-switch, bounded arm approval, risk rails, broker preflight, idempotency and
reconciliation rules all fail closed. Phase 11 can additionally notify
Telegram and/or WhatsApp when the scanner observes WATCH, NEAR_EXECUTE,
EXECUTE_READY, BLOCKED, or INVALIDATED lifecycle events. These alerts remain
read-only consumers of engine output.

See [docs/PHASE-6.md](./docs/PHASE-6.md) for release runtime/governance,
[docs/PHASE-7.md](./docs/PHASE-7.md) for forward validation,
[docs/PHASE-8.md](./docs/PHASE-8.md) for production reliability/recovery,
[docs/PHASE-9.md](./docs/PHASE-9.md) for transactional infrastructure, and
[docs/PHASE-10.md](./docs/PHASE-10.md) plus
[docs/PHASE-10-LIVE-RUNBOOK.md](./docs/PHASE-10-LIVE-RUNBOOK.md) for broker
execution safety and staged live operations. See
[docs/PHASE-11.md](./docs/PHASE-11.md) and
[docs/PHASE-11-NOTIFICATIONS.md](./docs/PHASE-11-NOTIFICATIONS.md) for realtime
alerts and Telegram/WhatsApp setup.


## Audit History

The engine has been audited layer by layer. Fixes are grouped by the batch
that introduced them; each batch is a separate commit that can be reverted
independently.

**Batch 1-2 â€” Core strategy, risk, execution**
- Entry price resolves from the trigger bar close, not the latest bar.
- Closed-only candle iteration in all four strategies.
- Approval secret enforced on every broker control mutation.
- Trigger slicing default flipped to keep every closed snapshot.

**Batch 3 â€” Data integrity, bias, indicators**
- ATR warmup and Wilder seed now share the same true-range set.
- MACD is O(n) instead of O(n^2).
- Bias label boundaries are symmetric around zero.
- engineTimestamp() throws in deterministic mode when marketAsOf is missing.

**Batch 4 â€” Backtest realism**
- Margin capacity uses equity (balance + unrealized), not balance alone.
- Swap charges 3x on the triple Wednesday rollover.
- Purge and embargo in temporal and sequential validation.
- Deflated Sharpe Ratio (Bailey & Lopez de Prado).
- Probability of Backtest Overfitting via CSCV.

**Batch 5 â€” Broker and providers**
- Bridge extracts position_id from the MT5 order_send result.
- Arm limits throw on out-of-bounds instead of silently clamping.
- JSON parse errors include path, HTTP status, and a body snippet.
- Bridge refuses ambiguous symbol prefix matches.
- OANDA rejects non-positive candle limits.
- Structured JSON logging in the MT5 bridge.

**Batch 6 â€” Configuration**
- Broker config falls back to safe defaults instead of crashing the process.
- Integer environment variables throw on non-integer input.
- .env.example covers every variable read by the bridge.

$f = "README.md"
$c = [System.IO.File]::ReadAllText($f)

$old = @'
**Batch 6 — Configuration**
- Broker config falls back to safe defaults instead of crashing the process.
- Integer environment variables throw on non-integer input.
- .env.example covers every variable read by the bridge.
'@

$new = @'
**Batch 6 — Configuration**
- Broker config falls back to safe defaults instead of crashing the process.
- Integer environment variables throw on non-integer input.
- .env.example covers every variable read by the bridge.

**Batch 7 — Signal lifecycle and paper trading**
- INVALIDATED lifecycles spawn fresh occurrences instead of reviving under
  the old signalId.
- Transition history is capped at 200 entries per lifecycle.
- Paper trading computes a per-position candle lookback, fixing silent
  SL/TP misses on old positions.
- transitionSignal contract documented; callers must attachIdentity.
'@

if (-not $c.Contains($old)) {
  Write-Host "Anchor not found. Update README manual." -ForegroundColor Red
} else {
  $c = $c.Replace($old, $new)
  [System.IO.File]::WriteAllText($f, $c, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "[OK] README updated" -ForegroundColor Green
}