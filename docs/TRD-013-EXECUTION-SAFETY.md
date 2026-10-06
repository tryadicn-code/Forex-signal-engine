# TRD-013 — Execution Engine Safety Invariants

**Status:** documented positive finding
**Audit reference:** TRD-013 (Execution Engine is a safety layer that must be preserved)
**Scope:** documentation only. No code, threshold, or trading behaviour is changed.

**Related code:**

- `src/core/execution/decision.ts`
- `src/core/execution/execution-engine.ts`
- `src/core/execution/index.ts`
- `src/core/execution/veto.ts`

## 1. Purpose

This document records the safety invariants of the Execution Engine so that:

- A future change cannot silently weaken a gate in the name of "more signals".
- The distinction between "the engine decided EXECUTE" and "an order was placed" stays unambiguous.
- Any operator reading the codebase understands why certain conditions block a trade.

## 2. What the Execution Engine is

A pure decision gate — the final stage of the pipeline:

    Market Data -> Structure -> Regime -> Bias -> Setup -> Trigger -> Risk -> Execution

It reads the outputs of every preceding stage and produces one of four decisions. It has no side effects, opens no orders, and sizes no position.

## 3. The four decisions

- **EXECUTE** — every mandatory condition passed and no hard veto fired.
- **WAIT** — the safe default whenever information is incomplete. A WAIT is not a failure; it is a deliberate refusal to act on incomplete information.
- **BLOCKED** — a valid setup that trips a risk guard or a hard veto. This is a deliberate stop.
- **INVALIDATED** — the underlying setup is no longer valid. The signal is discarded regardless of any other condition.

## 4. Priority order

The priority is deliberate and tested:

1. INVALIDATED — broken structure wins every tie.
2. BLOCKED — a risk-guarded setup must never execute.
3. EXECUTE — only when setup, trigger, and risk all agree.
4. WAIT — the safe default for incomplete information.

## 5. The four gates

The engine evaluates at least four gate families before it can emit EXECUTE:

- **Fail-closed freshness** — data older than the configured threshold blocks execution. Missing data is treated as STALE, not as an empty pass.
- **Spread guard** — a spread wider than the configured maximum blocks execution.
- **Risk gate** — a risk-rejected setup is BLOCKED, never WAIT-then-execute.
- **Hard veto** — any triggered veto forces BLOCKED regardless of every other passing condition.

Each gate is independently sufficient to block a trade. There is no override, no priority inversion, and no exception.

## 6. What the Execution Engine is NOT

- It does not size positions. Position sizing is the Risk Engine's responsibility.
- It does not transmit orders. Broker transmission is a separate, gated layer.
- It does not open, close, or manage positions.
- It does not persist side effects. Given the same inputs, it produces the same decision every time.

## 7. Change control

The following invariants are frozen until an explicit, evidence-backed change is approved:

- The four-decision taxonomy (WAIT / EXECUTE / BLOCKED / INVALIDATED).
- The priority order INVALIDATED > BLOCKED > EXECUTE > WAIT.
- The presence of each of the four gate families.
- The fail-closed default for missing or stale data.
- The rule that a hard veto cannot be overridden by any other passing condition.

The following change is explicitly forbidden:

- Removing or relaxing a gate solely to increase the count of EXECUTE decisions.

Any future change to an execution gate is a strategy-safety change and requires the full evidence chain: hypothesis, historical evidence, backtest, out-of-sample validation, forward validation, regression tests, and a risk assessment. Until that evidence exists, the current gates and priority order are the frozen baseline.

## 8. Why this matters

The dashboard shows four different lifecycle states for a reason. A signal that reads WAIT is not a failed signal; it is a signal that has not met the entry criteria. A signal that reads BLOCKED is not a bug; it is the risk system working. Removing a gate would not create more valid opportunities — it would create more invalid ones.

The engine's job is to say "no" correctly. That is a feature, not a limitation.

## 9. Reference

- Decision function and priority: `src/core/execution/decision.ts`
- Veto definitions: `src/core/execution/veto.ts`
- Public surface: `src/core/execution/index.ts`
- Pipeline assembly: `src/core/execution/execution-engine.ts`