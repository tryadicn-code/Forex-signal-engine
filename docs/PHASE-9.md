# Phase 9 — Transactional Infrastructure & Deployment Architecture

**Status: RELEASE CANDIDATE**

Phase 9 removes the Phase 8 single-node persistence ceiling without enabling live broker execution.

## Phase 9.1 — Transactional State Contract

A provider-neutral transactional contract now covers versioned JSON documents, optimistic compare-and-swap writes, prefix listing, distributed leases, fencing tokens, durable jobs, and structured telemetry.

Application code depends on this contract rather than a database SDK. Two adapters exist: an in-memory adapter for deterministic tests and an HTTP/PostgREST adapter for shared production state.

Reference backend: infra/postgres/phase-9.sql

## Phase 9.2 — Shared Operational State

When FSE_TX_STORE_MODE=remote, the following state moves to shared transactional persistence:

- Paper Trading account/orders/positions/trades/ledger
- strategy version registry
- release runtime audit
- forward-validation observations
- backtest artifacts and release review metadata

LOCAL mode remains available for single-node development. FSE_REQUIRE_SHARED_TX_STORE=true blocks readiness if shared persistence is required but not active.

## Phase 9.3 — Revision CAS & Stale Writer Protection

Every shared document has a monotonically increasing revision. Mutations read revision N, derive state, then compare-and-swap expected N to commit N+1. Stale writers receive a conflict instead of overwriting newer state.

Paper Trading is stricter: a stale Paper save fails closed, preventing an old runtime from replacing a newer ledger.

## Phase 9.4 — Distributed Scanner Lease & Fencing

The scanner uses a shared scanner-cycle lease. Only one instance may own it at a time. Grants carry owner ID, fencing token, and expiry.

After analysis and before Paper mutation, lease ownership is revalidated. If the lease expired or moved to another instance, Paper execution is not applied.

## Phase 9.5 — Durable Jobs

The transactional layer supports enqueue, claim, leased ownership, fencing, attempts, bounded retry, success, and failure states.

The runOneDurableJob worker abstraction claims one job and can complete or fail it only when fencing ownership still matches.

## Phase 9.6 — Structured Telemetry & Health

Scanner cycles emit structured telemetry in SHARED mode.

Endpoint: GET /api/system/telemetry?limit=50

Production health protocol is phase-9-health-v1 and includes LOCAL/SHARED mode, instance identity, transactional reachability/latency, shared-store strict gate, startup recovery, provider/release checks, and local persistence integrity when LOCAL mode is used.

## Phase 9.7 — Controlled Cutover

Maintenance-only migration endpoint: POST /api/system/migration

Required state:

    FSE_MAINTENANCE_MODE=true
    FSE_TX_STORE_MODE=remote

The request requires createdBy and reason. Migration seeds absent shared state, treats equivalent existing state as idempotent, and refuses to overwrite non-equivalent shared state.

## Deployment Topology

    clients
       ↓
    load balancer / ingress
       ↓
    stateless FSE replicas
       ↓
    shared transactional PostgreSQL
       ↓
    market-data provider / MT5 bridge

Next.js output is standalone for self-hosted stateless replicas.

## Recovery Boundary

Phase 8 checksum/backup recovery remains valid in LOCAL mode. In SHARED mode, PostgreSQL is authoritative and backup/PITR belongs to infrastructure. Phase 8 local snapshots are not a substitute for shared database backup.

## Security / Execution Boundary

Phase 9 does not add broker credentials, broker order APIs, live execution, automatic strategy promotion/rollback, or performance-driven self-retuning. Execution remains PAPER.

## Phase 9 Definition of Done

1. transactional persistence interface exists
2. shared remote adapter exists
3. deterministic in-memory adapter exists
4. revisions and CAS protect shared documents
5. stale Paper writers fail closed
6. Paper state supports shared persistence
7. forward-validation supports shared persistence
8. strategy registry supports shared persistence
9. runtime audit supports shared persistence
10. backtest artifacts support shared persistence
11. distributed scanner lease exists
12. lease fencing tokens exist
13. Paper mutation revalidates lease ownership
14. expired lease blocks Paper execution
15. durable job enqueue/claim/complete/fail exists
16. durable job worker and retry behavior exist
17. structured telemetry and API exist
18. backend health and latency are surfaced
19. strict shared-store readiness gate exists
20. dashboard surfaces Phase 9 infrastructure state
21. reference PostgreSQL schema and atomic RPCs exist
22. PostgreSQL job claim uses row locking / SKIP LOCKED
23. maintenance-only migration exists
24. migration refuses non-equivalent overwrite
25. migration can resume idempotently
26. standalone deployment output is enabled
27. local mode remains available for development
28. live broker execution remains disabled
29. Phase 1–8 regression behavior remains covered
30. typecheck passes
31. tests pass
32. lint passes
33. production build passes

## Completion Gate

Phase 9 becomes COMPLETE only after the final branch head passes MT5 Python syntax validation, TypeScript typecheck, Vitest, ESLint, and Next.js production build.
