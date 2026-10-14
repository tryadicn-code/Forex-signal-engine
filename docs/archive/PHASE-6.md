# Phase 6 — Strategy Release Runtime & Governance

**Status: COMPLETE**

Phase 6 turns the immutable strategy registry created in Phase 5 into the
authoritative runtime configuration source for the forward scanner/Paper
Trading system.

It does not add live broker execution.

## Phase 6.1 — Active Release Resolver

Before the server constructs a scanner instance, it reads:

```
.data/strategy-version-registry.json
```

Runtime states are explicit:

- `UNVERSIONED` — registry is completely empty; migration-compatible built-in
  defaults may still run.
- `ACTIVE` — exactly one verified ACTIVE strategy manifest is resolved and
  pinned into runtime.
- `BLOCKED` — governance is already in use but no valid ACTIVE release can be
  resolved.

An empty registry is intentionally different from a governed registry with
history but no ACTIVE version.

Once strategy governance has begun, the scanner fails closed if there is no
ACTIVE release.

## Phase 6.2 — Runtime Configuration Pinning

An ACTIVE manifest pins the strategy-sensitive runtime inputs:

- validated symbol universe,
- Phase 1 `EngineConfig`,
- timeframe roles,
- setup/trigger TTL,
- freshness thresholds,
- candle lookback,
- validated risk percentage.

Operational inputs remain runtime-owned:

- market-data provider connection,
- Paper account balance,
- conversion rates,
- current scan clock,
- execution mode remains `PAPER`.

The scanner now forwards the pinned full `EngineConfig` into the existing
Phase 1 orchestrator through its existing `configOverrides` contract. No
strategy algorithm is duplicated.

## Phase 6.3 — Drift Detection & Fail-Closed Guard

For an ACTIVE release the runtime compares the frozen manifest configuration
with current code defaults.

The runtime exposes:

- `defaultDrift`,
- exact `driftAreas`.

Current drift areas:

- engineConfig,
- timeframeRoles,
- signalTtl,
- freshness,
- candleLookback,
- riskPercent.

A default drift does **not** silently replace the release configuration. The
validated manifest stays pinned, while the drift remains visible for review.

Blocking conditions include:

- governed registry with no ACTIVE release,
- unreadable/corrupt registry,
- ACTIVE manifest integrity failure.

When BLOCKED:

- no scanner cycle is started,
- automatic scan is reported disabled,
- no new Paper execution can be created,
- dashboard reports the release-runtime reason.

If a release changes while a scan is already analysing market data, the server
re-resolves governance before Paper execution. Results from the stale release
may finish analysis, but Paper orders are not applied.

## Phase 6.4 — Runtime Health & Audit

The dashboard payload includes the release runtime identity and health.

The UI exposes:

- ACTIVE / UNVERSIONED / BLOCKED,
- semantic strategy version,
- PINNED state,
- manifest fingerprint,
- default configuration drift,
- human-readable runtime message.

A dedicated read-only endpoint is available:

```
GET /api/runtime/release
```

It returns current runtime state and bounded runtime audit history.

Audit persistence:

```
.data/release-runtime-audit.json
```

The audit log records state transitions rather than every repeated observation.
Writes are serialized in-process and bounded to the most recent 200 events.

Runtime audit persistence failure does not silently change strategy state:
governance resolution remains authoritative.

## Phase 6.5 — Controlled Rollback

A `SUPERSEDED` immutable manifest can be explicitly reactivated through a
controlled rollback.

Rollback requires:

- exact target version,
- actor,
- reason.

It cannot reactivate a `DEPRECATED` release.

If another version is ACTIVE:

```
current ACTIVE
     ↓
SUPERSEDED

rollback target SUPERSEDED
     ↓
ACTIVE
```

Both lifecycle changes are append-only events. Neither immutable manifest is
modified.

The registry UI exposes the Rollback control only on SUPERSEDED versions.

Registry mutations are serialized within the Node process so register,
supersede, rollback and deprecate operations cannot concurrently overwrite one
another.

## Phase 6.6 — Operational Integration & Hardening

The process-wide scanner identity includes:

- release status,
- semantic version,
- manifest fingerprint.

When that identity changes the next runtime resolution reconstructs the scanner
with the new pinned configuration.

This makes:

- promotion,
- explicit supersession,
- rollback,
- transition to BLOCKED

observable without restarting the application.

The automatic scan loop re-resolves release governance before every cycle.

The UI header and workstation expose strategy identity separately from the
market-data provider identity. For example:

```
LIVE · MT5     STRAT · v1.0.0
```

These have different meanings:

- `LIVE · MT5` = live market-data source,
- `STRAT · v1.0.0` = pinned validated strategy release,
- execution remains PAPER.

## Persistence boundaries

Phase 6 uses:

```
.data/strategy-version-registry.json
.data/release-runtime-audit.json
```

It does not merge with:

```
.data/paper-trading.json
.data/backtest-runs/
```

Backtest evidence, Paper account state, registry governance and release runtime
audit remain separate domains.

## Concurrency boundary

Atomic JSON writes plus in-process mutation queues protect the normal single
Node runtime used by the application.

This is not a distributed database lock. Multi-instance/distributed deployment
requires a shared transactional persistence layer in a later production phase.

## Phase 6 completed architecture

```
Phase 5 validated strategy manifest
              ↓
     Strategy Version Registry
              ↓
      ACTIVE Release Resolver
              ↓
      Integrity Verification
              ↓
       Default Drift Check
              ↓
     Runtime Config Pinning
              ↓
     EXISTING FSE Scanner
              ↓
     Existing Phase 1 Engine
              ↓
        Paper Execution
```

Governance changes:

```
Promote new validated version
              ↓
 explicit supersession
              ↓
 ACTIVE release changes
              ↓
 scanner reconstructs from new manifest

or

SUPERSEDED validated version
              ↓
 controlled rollback
              ↓
 ACTIVE release changes
              ↓
 scanner reconstructs from rollback manifest
```

## Phase 6 Definition of Done

1. runtime resolves strategy registry before scanner construction,
2. empty registry is explicitly UNVERSIONED,
3. governed registry without ACTIVE release fails closed,
4. corrupt/invalid registry fails closed,
5. ACTIVE manifest integrity is verified,
6. validated symbols are pinned from the ACTIVE manifest,
7. full EngineConfig is pinned into the existing Phase 1 orchestrator,
8. timeframe roles/TTL/freshness/lookback are pinned,
9. validated risk percentage is pinned,
10. Paper balance remains dynamic operational state,
11. live market-data provider identity remains independent,
12. default configuration drift is observable,
13. drift does not silently modify the pinned release,
14. release change during scan cannot create stale-release Paper orders,
15. scanner instance identity follows release version/fingerprint,
16. automatic scanner re-resolves governance each cycle,
17. runtime status is available in dashboard data,
18. runtime status is visible in desktop/mobile workstation UI,
19. release health/audit API is available,
20. runtime state transitions are persisted in a bounded audit log,
21. strategy registry mutations are serialized in-process,
22. SUPERSEDED versions support explicit rollback,
23. DEPRECATED versions cannot be rolled back,
24. rollback lifecycle changes preserve immutable manifests,
25. runtime remains PAPER-only,
26. prior Phase 1–5 behavior remains covered by regression tests,
27. typecheck, tests, lint and production build pass.

# Phase 6 Completion

**Phase 6 — Strategy Release Runtime & Governance is complete.**

The next major milestone is:

**Phase 7 — Forward Validation & Runtime Drift Monitoring**

Phase 7 should evaluate a pinned ACTIVE release over new unseen market data for
a sustained period, compare historical evidence to forward Paper outcomes, and
monitor performance/data/execution drift without automatically changing the
strategy.
