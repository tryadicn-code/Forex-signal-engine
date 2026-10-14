# Phase 9 Deployment & Cutover Runbook

## 1. Prepare PostgreSQL

Apply infra/postgres/phase-9.sql with a privileged migration role. Use a server-only credential for the RPC surface.

## 2. First deployment: maintenance

Configure every replica:

    FSE_MAINTENANCE_MODE=true
    FSE_TX_STORE_MODE=remote
    FSE_REQUIRE_SHARED_TX_STORE=true
    FSE_TX_STORE_URL=<postgrest base>/rest/v1
    FSE_TX_STORE_TOKEN=<server-only credential>
    FSE_INSTANCE_ID=<unique stable replica id>

Execution remains PAPER.

## 3. Verify backend health

Check GET /api/system/live and GET /api/system/health. Expect process live, SHARED infrastructure, transactional backend PASS, and maintenance mode intentionally blocking scan execution.

## 4. Seed Phase 8 state

From exactly one maintenance replica call POST /api/system/migration with:

    {
      "createdBy": "operator-id",
      "reason": "Phase 9 shared-state cutover"
    }

The migration refuses to overwrite different remote state. Re-running is safe when already-seeded state is equivalent.

## 5. Verify state

Review Paper history, strategy registry/ACTIVE release, forward-validation evidence, backtests, and release runtime audit.

## 6. Enable replicas

Set FSE_MAINTENANCE_MODE=false and restart all replicas. Keep FSE_REQUIRE_SHARED_TX_STORE=true for multi-instance deployment.

## 7. Verify distributed ownership

Trigger or wait for a scan. Confirm only one scanner owns the shared lease, health remains expected, telemetry records the cycle, and Paper orders are not duplicated.

## Rollback

If abandoning shared cutover before new shared writes: enable maintenance everywhere, stop extra replicas, verify local Phase 8 state is still authoritative, switch one instance to FSE_TX_STORE_MODE=local, disable FSE_REQUIRE_SHARED_TX_STORE, and restart single-node.

Do not rollback to old local state after meaningful new shared Paper/governance writes without explicit reverse migration/reconciliation.

## Backup

In SHARED mode configure PostgreSQL backup and point-in-time recovery. Phase 8 JSON backup/snapshots are not the authoritative disaster-recovery mechanism for shared state.
