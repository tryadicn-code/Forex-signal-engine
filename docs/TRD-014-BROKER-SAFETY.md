# TRD-014 — Broker Execution Safety Invariants

**Status:** documented positive finding
**Audit reference:** TRD-014 (Broker Execution has good safety mechanisms)
**Scope:** documentation only. No code, threshold, or broker behaviour is changed.

**Related code:**

- `src/broker/execution-service.ts`
- `src/broker/execution-store.ts`
- `src/broker/mt5-provider.ts`
- `src/broker/shadow-provider.ts`
- `src/broker/types.ts`

## 1. Purpose

This document records the safety invariants of the broker execution layer so that:

- A future change cannot silently bypass a safety mechanism in the name of "faster execution".
- The difference between SHADOW and LIVE modes stays unambiguous.
- The rule that an UNKNOWN outcome must be reconciled, never automatically retried, is preserved.

## 2. Where this layer sits

The broker layer sits downstream of the Execution Engine. The engine decides "what should happen". The broker layer decides "what is safe to transmit", and only then transmits.

At no point does the broker layer override an engine decision. It can only refuse to transmit.

## 3. Safety mechanisms

The current design includes at least the following independent mechanisms:

- **Idempotency key** — every submission carries a stable client order identifier, so a repeat submission is deduplicated rather than duplicated.
- **External execution lease** — a lease must be held before any LIVE submission can proceed. A lease that cannot be acquired blocks transmission.
- **Broker state re-read** — before submitting, the layer re-reads broker-side state (connection, account, symbol allowlist, margin). A stale snapshot is not trusted.
- **Preflight** — mode (OFF / SHADOW / LIVE), symbol allowlist, and per-cycle limits are checked before submission.
- **Volume normalization** — lot size is normalized to the broker's min, max, and lot step before transmission.
- **Uncertain-outcome handling** — a submission whose outcome cannot be confirmed is recorded as UNKNOWN and escalated to reconciliation, not retried.
- **Reconciliation** — an unresolved submission is reconciled against the broker until a definitive state (ACCEPTED, REJECTED, or RECONCILIATION_REQUIRED) is recorded.
- **No blind retry** — no automatic retry of a submission whose outcome is not definitively known.

## 4. The UNKNOWN outcome rule

A submission whose outcome cannot be confirmed must be recorded as requiring reconciliation. It must not be retried automatically.

Reason: a retry can create a duplicate order if the original submission actually succeeded. The cost of a duplicate LIVE order is far higher than the cost of pausing and reconciling.

This rule applies regardless of how long the uncertainty lasts. An UNKNOWN that persists for hours is still not a candidate for automatic retry — it is a candidate for reconciliation and, if necessary, manual intervention.

## 5. Mode safety

- **OFF** — no broker processing at all.
- **SHADOW** — safety decisions are recorded but nothing is transmitted. This is the default mode and the only mode a new deployment should start in.
- **LIVE** — transmission is eligible only when every gate passes. LIVE is not a default and is not reachable without explicit configuration and an active lease.

The layer cannot be flipped to LIVE by any automated process. Every promotion requires explicit operator configuration.

## 6. What this layer is NOT

- It is not a decision maker. The Execution Engine decides; the broker layer transmits what the engine permitted.
- It is not a retry orchestrator. It records uncertainty and defers to reconciliation.
- It is not a monitoring or alerting component. Those are separate.
- It does not bypass the Execution Engine, the Risk Engine, or the freshness gate. Ever.

## 7. Change control

The following invariants are frozen until an explicit, evidence-backed change is approved:

- The presence of an idempotency key on every submission.
- The presence of an external execution lease for LIVE submissions.
- The re-read of broker-side state before submission.
- The presence of a preflight gate (mode, symbol, limits).
- Volume normalization before transmission.
- The rule that an UNKNOWN outcome is reconciled, never automatically retried.
- The rule that LIVE requires explicit operator configuration.

The following change is explicitly forbidden:

- Replacing the UNKNOWN → reconciliation path with an automatic retry.

Any future change to a broker safety mechanism is a production-safety change and requires the full evidence chain: hypothesis, historical evidence, dry-run or SHADOW validation, reconciliation audit, forward validation on a controlled window, regression tests, and a risk assessment. Until that evidence exists, the current mechanisms are the frozen baseline.

## 8. Why this matters

A duplicate LIVE order is not a rounding error. It is real capital at risk. The reason the broker layer pauses on UNKNOWN instead of retrying is that the recovery cost of pausing is bounded, while the cost of a duplicate order is not.

The layer is intentionally slower than an "aggressive execution engine" would be. That slowness is the feature.

## 9. Reference

- Submission and reconciliation flow: `src/broker/execution-service.ts`
- Persistence and lease: `src/broker/execution-store.ts`
- MT5 adapter: `src/broker/mt5-provider.ts`
- Shadow adapter (SHADOW mode): `src/broker/shadow-provider.ts`
- Broker-side types: `src/broker/types.ts`