# Forex Signal Engine

Automated **Forex scanner + signal dashboard**. The system ingests market data,
runs it through a strictly ordered decision pipeline, and emits explainable
trade signals.

> **Status: Phase 10 — Broker Integration & Live Execution Safety COMPLETE.**
> The project includes the core strategy engine, multi-pair scanner/dashboard,
> deterministic Paper Trading, historical + forward validation, immutable
> strategy releases, local recovery, shared transactional persistence,
> distributed leases/fencing, durable jobs, structured telemetry, plus a
> provider-neutral broker layer with OFF/SHADOW/LIVE safety gates. Real broker
> transmission is supported only when explicitly configured and armed; repository
> defaults keep broker execution OFF and the emergency stop engaged.

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
  lib/               Small shared helpers
  types/             Shared domain types (provider-agnostic)
tests/               Test suite mirroring the source tree
```

The repository now contains provider, scanner, Paper Trading, historical
validation, release-runtime governance, forward-validation, local reliability,
shared transactional infrastructure and the Phase 10 broker execution safety
layer. LOCAL mode remains useful for development; shared transactional state is
required before LIVE broker execution can be armed.

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
reconciliation rules all fail closed.

See [docs/PHASE-6.md](./docs/PHASE-6.md) for release runtime/governance,
[docs/PHASE-7.md](./docs/PHASE-7.md) for forward validation,
[docs/PHASE-8.md](./docs/PHASE-8.md) for production reliability/recovery,
[docs/PHASE-9.md](./docs/PHASE-9.md) for transactional infrastructure, and
[docs/PHASE-10.md](./docs/PHASE-10.md) plus
[docs/PHASE-10-LIVE-RUNBOOK.md](./docs/PHASE-10-LIVE-RUNBOOK.md) for broker
execution safety and staged live operations.
