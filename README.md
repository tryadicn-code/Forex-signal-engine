# Forex Signal Engine

Automated **Forex scanner + signal dashboard**. The system ingests market data,
runs it through a strictly ordered decision pipeline, and emits explainable
trade signals.

> **Status: Phase 5 — Historical Validation / Backtest COMPLETE.**
> The project includes the core strategy engine, multi-pair scanner/dashboard,
> deterministic Paper Trading, historical replay/execution, analytics,
> robustness/OOS validation, statistical diagnostics, human release review and
> an immutable strategy-version registry. Live broker execution is intentionally
> not enabled.

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
- PostgreSQL + Prisma and TradingView Lightweight Charts are planned for later
  phases and are **not** installed yet.

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
    execution/       Execution decision gate (Phase 1: SIGNAL ONLY)
  lib/               Small shared helpers
  types/             Shared domain types (provider-agnostic)
tests/               Test suite mirroring the source tree
```

The repository now contains provider, scanner, paper-trading and historical
validation/replay layers. Phase 5 historical reports and strategy manifests are
stored under `.data/` and remain isolated from the Phase 4 paper account.

## Engineering principles

- **Modular** - one responsibility per module, no god files.
- **Strongly typed** - shared domain types are the contract between layers.
- **Testable** - engine logic is pure functions, easy to unit test.
- **Provider-agnostic** - market data is normalized before engines see it.
- **Explainable** - every decision records why it was made.
- **Separated concerns** - trading logic never lives in React components; market
  data providers and broker integration stay independent of the engine.

## Scope guardrails

The FSE can scan, validate signals, simulate Paper Trading and run deterministic
historical validation. It still does **not** send real broker orders. A Phase
5.9 ACTIVE strategy version means that exact configuration has recorded
validation evidence and human release review; it is not an authorization for
live trading.
