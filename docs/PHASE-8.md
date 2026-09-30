# Phase 8 — Production Hardening, Reliability & Recovery

**Status: COMPLETE**

Phase 8 hardens the single-node FSE runtime so Paper Trading, strategy
governance and forward-validation state fail closed and recover predictably
across crashes/restarts.

It does not add live broker execution.

## Phase 8.1 — Durable Persistence & Integrity

Critical JSON persistence now uses one shared durable write path:

- atomic temporary-file replacement,
- file fsync before rename,
- directory fsync when supported,
- SHA-256 checksum sidecar,
- previous-good .bak snapshot,
- schema validation on domain reads,
- explicit integrity health.

Covered state:

    paper-trading.json
    strategy-version-registry.json
    release-runtime-audit.json
    forward-validation.json
    backtest-runs/*.json

Existing Phase 4–7 JSON remains backward compatible.

A valid legacy file without a checksum is read as LEGACY_UNVERIFIED and gains
checksum/backup metadata on its next normal write.

## Phase 8.2 — Automatic Previous-Good Recovery

When a primary file cannot be verified because of invalid JSON, checksum
mismatch or schema failure, the durable reader attempts the previous-good
backup.

    invalid primary
          ↓
    verified .bak
          ↓
    primary reconstructed
          ↓
    normal domain read continues

If both primary and backup fail, the state is CORRUPT and the error is
surfaced.

Paper account handling is specifically fail-closed.

Prior behavior that could fall back to the initial USD 10,000 balance after an
unrecoverable Paper persistence error has been removed.

An unreadable Paper ledger cannot silently become a new account and cannot
create new Paper executions.

Forward-validation persistence is also preflighted before Paper execution so a
new release-scoped Paper order is not created when its evidence store is already
known to be unrecoverable.

## Phase 8.3 — Startup Recovery Barrier

The first scanner access in a Node process runs a one-time startup recovery
barrier over:

- Paper state,
- strategy registry,
- runtime release audit,
- forward-validation state,
- persisted backtest report index.

Critical domains are Paper state, strategy registry and forward-validation
state.

If any critical state cannot be read/recovered, scanner execution is blocked.

Non-critical audit/report-index problems are surfaced as warnings rather than
silently discarded.

The automatic scanner loop also honors the startup barrier.

## Phase 8.4 — Health, Readiness, Liveness & Maintenance

Two operational endpoints are available.

### Liveness

    GET /api/system/live

Liveness confirms the Node application process is responsive and returns:

- boot timestamp,
- current timestamp,
- process uptime,
- execution mode.

It does not claim the scanner is ready.

### Readiness

    GET /api/system/health

Readiness checks:

- startup recovery,
- PAPER execution guardrail,
- maintenance mode,
- writable data directory,
- ACTIVE strategy runtime state,
- required ACTIVE-release policy,
- market-data mode,
- provider state,
- persistence integrity,
- scanner in-flight age.

Readiness states:

- READY
- DEGRADED
- BLOCKED

A BLOCKED readiness response uses HTTP 503.

### Maintenance mode

    FSE_MAINTENANCE_MODE=true

Maintenance mode keeps the application and health/recovery APIs online while
blocking automatic scan cycles, manual scan refreshes and new Paper execution.

This provides a safe window for deployment/storage maintenance.

Changing the environment requires restarting the Node process.

### Strict deployment gates

Optional:

    FSE_REQUIRE_ACTIVE_RELEASE=true
    FSE_REQUIRE_LIVE_MARKET_DATA=true

When enabled, readiness fails if their requirement is not satisfied.

These do not enable broker trading.

## Phase 8.5 — Storage Layout & Recovery Snapshots

All default state paths now resolve through one storage configuration.

Default root:

    <project>/.data

Optional override:

    FSE_DATA_DIR=/persistent/path

The root contains:

    paper-trading.json
    strategy-version-registry.json
    release-runtime-audit.json
    forward-validation.json
    backtest-runs/
    snapshots/

Legacy individual Paper/forward path overrides remain supported.

### Maintenance-only recovery snapshots

Endpoints:

    GET  /api/system/recovery
    POST /api/system/recovery
    GET  /api/system/recovery?verify=snapshot-<timestamp>

POST requires createdBy and reason fields and only succeeds while maintenance
mode is enabled.

Each recovery snapshot captures the current operational copies of:

- Paper state,
- strategy registry,
- release runtime audit,
- forward-validation evidence.

Every captured file has:

- byte count,
- SHA-256 checksum,
- snapshot-relative filename.

Snapshot verification re-hashes every copy.

Retention is bounded to the 10 newest snapshots.

There is intentionally no browser/API restore-all action. Restoring several
governance/ledger domains blindly can create cross-domain inconsistencies.
Routine primary-file corruption is already recovered automatically from each
domain's previous-good backup. Disaster restoration from a recovery snapshot
remains an explicit maintenance operation.

## Phase 8.6 — Concurrency, UI & Operational Hardening

Mutation serialization now covers:

- Paper service operations,
- forward-validation store appends,
- strategy registry mutations,
- release audit writes,
- backtest report metadata/release-review mutations.

The main dashboard includes a Phase 8 Production Health panel showing:

- READY / DEGRADED / BLOCKED,
- execution mode,
- provider and provider state,
- strategy release,
- uptime,
- startup recovery,
- storage writability,
- persistence integrity,
- maintenance mode,
- strict release/live-data requirements,
- scanner watchdog warning state.

No extra bottom-navigation item was added.

### Scanner watchdog visibility

Production health records whether a scanner cycle is currently in flight.

A scan exceeding 120 seconds is surfaced as a readiness warning.

The health layer does not forcibly terminate an in-flight provider operation;
provider-specific request timeouts remain responsible for network cancellation.

## Persistence Failure Semantics

Normal sequence:

    domain mutation
       ↓
    preserve previous-good backup
       ↓
    write temp primary
       ↓
    fsync temp
       ↓
    write checksum temp
       ↓
    fsync checksum
       ↓
    atomic rename
       ↓
    best-effort directory fsync

Crash between primary and checksum replacement is treated conservatively:
the mismatched primary is rejected and the previous-good backup can be restored.

## Single-Node Boundary

Phase 8 materially hardens the local/single-Node runtime, but it is not a
distributed transaction system.

The following are intentionally not claimed:

- multi-instance writer safety,
- distributed locking,
- cross-host consensus,
- database transactions,
- automatic off-host backup,
- high-availability failover.

A horizontally scaled deployment should not point multiple writers at the same
local JSON directory.

A later infrastructure phase must migrate operational state to a shared,
transactional persistence layer before multi-instance operation.

## Security / Execution Boundary

Phase 8 does not introduce:

- broker credentials,
- order placement APIs,
- live execution,
- automated strategy changes,
- automated rollback based on performance,
- hidden fail-open behavior.

Runtime execution remains PAPER.

## Phase 8 Definition of Done

1. critical JSON state uses atomic durable writes,
2. state writes produce SHA-256 integrity metadata,
3. previous-good copies are retained,
4. valid legacy JSON remains readable,
5. corrupt primary state recovers from verified backup,
6. corrupt primary + backup fails explicitly,
7. Paper persistence failure no longer falls back to a fresh balance,
8. forward evidence persistence is checked before Paper execution,
9. strategy registry uses the durable layer,
10. release audit uses the durable layer,
11. forward-validation store uses the durable layer,
12. backtest reports use the durable layer,
13. state paths support a common persistent data root,
14. startup recovery runs once per Node process,
15. critical startup recovery failure blocks scanning,
16. automatic scanner honors startup recovery,
17. manual scanner honors startup recovery,
18. maintenance mode blocks scanning while keeping process/API alive,
19. liveness endpoint is available,
20. readiness endpoint is available,
21. BLOCKED readiness returns HTTP 503,
22. storage writability is probed,
23. provider readiness is surfaced,
24. strategy release readiness is surfaced,
25. persistence integrity is surfaced,
26. scanner in-flight age is surfaced,
27. recovery snapshots require maintenance mode,
28. recovery snapshots carry per-file checksums,
29. recovery snapshots can be verified,
30. snapshot retention is bounded,
31. no unsafe one-click whole-system restore is exposed,
32. backtest read-modify-write mutations are serialized,
33. production health is visible in the dashboard,
34. deployment safety environment variables are documented,
35. Phase 1–7 behavior remains regression-covered,
36. typecheck, tests, lint and production build pass.

# Phase 8 Completion

**Phase 8 — Production Hardening, Reliability & Recovery is complete.**

The system progression is now:

    Phase 1   Core decision engine
    Phase 2   Scanner engine
    Phase 3   Signal dashboard
    Phase 4   Deterministic Paper Trading
    Phase 5   Historical validation / backtest
    Phase 6   Strategy release runtime & governance
    Phase 7   Forward validation & drift monitoring
    Phase 8   Production hardening / reliability / recovery

The next major milestone should be:

**Phase 9 — Transactional Infrastructure & Deployment Architecture**

That phase should replace local operational persistence with a shared
transactional store, introduce durable job ownership/leases, structured
telemetry and deployment topology suitable for multi-instance operation.

Real broker execution should remain a separate later milestone and should not
be coupled to the infrastructure migration.
