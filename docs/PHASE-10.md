# Phase 10 — Broker Integration & Live Execution Safety

**Status: COMPLETE**

Phase 10 adds an explicitly gated broker-execution layer after the validated scanner and Paper Trading path.

Completing Phase 10 does not enable real-money trading by default.

Safe defaults remain:

    FSE_BROKER_MODE=off
    FSE_LIVE_EXECUTION_ENABLED=false
    FSE_LIVE_EMERGENCY_STOP=true
    broker kill-switch = ENGAGED
    live arm = NONE
    live symbol allowlist = EMPTY

## Phase 10.1 — Broker Provider Contract

A provider-neutral broker interface now defines:

- broker/account status
- order preflight
- order submission
- open-position inspection
- reconciliation by FSE client tag

Providers:

- ShadowBrokerProvider — never transmits an external order
- Mt5BrokerProvider — talks to the separately gated local MT5 trade bridge

## Phase 10.2 — OFF / SHADOW / LIVE Progression

Modes:

    OFF
      no broker execution processing

    SHADOW
      evaluate real broker preflight when configured
      persist execution evidence
      never call broker order submission

    LIVE
      may submit only after every Phase 10 safety gate passes

The scanner/Paper path remains available as the deterministic baseline.

## Phase 10.3 — Durable Execution Intent & Idempotency

Each broker candidate is frozen into an intent bound to:

- strategy version
- manifest fingerprint
- strategy activation epoch
- signal ID
- symbol and direction
- frozen entry
- stop loss / take profit
- frozen lot size
- frozen risk percent
- account currency

The idempotency key is deterministic for the exact strategy epoch + signal.

Once an execution record exists, the same signal is never automatically submitted again.

## Phase 10.4 — Independent Live Risk Rails

Live risk limits are independent of strategy configuration.

Hard gates include:

- explicit symbol allowlist
- max risk percent per live order
- max lot size
- max orders per scanner cycle
- max broker open positions
- optional same-symbol-position block
- max broker equity drawdown
- account-currency match
- exact broker volume normalization
- frozen-entry price drift limit
- broker stop-level geometry
- broker account permission
- expert/algo trading permission
- terminal trading permission

Broker uncertainty fails closed.

## Phase 10.5 — Multi-Key Live Enablement

Real submission requires all of the following:

1. FSE_BROKER_MODE=live
2. FSE_LIVE_EXECUTION_ENABLED=true
3. FSE_LIVE_EMERGENCY_STOP=false
4. shared transactional state
5. real broker provider configured
6. non-empty explicit symbol allowlist
7. approval secret configured
8. persistent kill-switch disengaged
9. non-expired live arm approval
10. positive remaining arm order quota
11. no unresolved prior live submission
12. distributed live-execution lease
13. pinned ACTIVE strategy release with no default drift
14. all broker/risk preflight gates pass

Any one failed condition blocks the order.

## Phase 10.6 — Kill Switch & Arm Approval

The persistent kill-switch defaults ENGAGED.

Engaging it also revokes the current live arm.

Disengaging it requires:

- shared transactional state
- live execution environment gate enabled
- environment emergency stop disabled
- approval-secret-protected control API

Live arm approvals are:

- operator-attributed
- reason-attributed
- time-limited
- order-count-limited
- persisted transactionally

Arm order quota is consumed conservatively before external broker preflight/submission.

## Phase 10.7 — Environment Emergency Stop

FSE_LIVE_EMERGENCY_STOP defaults true even if omitted.

This is independent from the database-backed kill-switch. It provides an infrastructure-level stop if shared control state or the application control API is unavailable.

Changing environment configuration requires process restart.

## Phase 10.8 — Distributed Live Execution Lease

Live submission requires the shared lease:

    broker-live-execution

The exact acquired grant is released using its original fencing token.

This is separate from the scanner-cycle lease and protects the external side effect itself.

## Phase 10.9 — MT5 Trade Bridge

The existing MT5 market-data bridge remains read-only by default.

Trade endpoints appear only behind a second explicit gate:

    MT5_TRADE_BRIDGE_ENABLED=true
    MT5_TRADE_BRIDGE_TOKEN=<server-only token>

Trade endpoints require bearer authentication:

    GET  /trade/status
    GET  /trade/positions
    GET  /trade/reconcile?tag=<clientTag>
    POST /trade/check
    POST /trade/order

The bridge performs MetaTrader 5 order_check before order_send.

Additional bridge checks include:

- symbol resolution
- current bid/ask validity
- broker volume min/max/step
- stop / take-profit direction
- broker minimum stops level
- frozen-entry maximum deviation
- supported filling policy
- explicit FSE-LIVE confirmation on order submission

## Phase 10.10 — Ambiguous Submission Handling

Broker rejection and transport uncertainty are deliberately different.

Known rejection:

    LIVE_REJECTED

Transport failure after submission begins:

    RECONCILIATION_REQUIRED

An ambiguous submission is never automatically retried.

While any execution record is RECONCILIATION_REQUIRED, all new live orders are blocked.

Manual/operator reconciliation is read-only at the broker:

    POST /api/broker/reconcile

Matching uses both the FSE client tag and MT5 magic number.

## Phase 10.11 — Operator API

Read-only dashboard:

    GET /api/broker

Control endpoint:

    POST /api/broker/control

Actions:

- kill-switch
- arm
- disarm

Every control mutation requires:

    X-FSE-Approval-Secret

The approval secret is server-side only and is never rendered into the dashboard.

## Phase 10.12 — Health & UI

Production health protocol:

    phase-10-health-v1

Health surfaces:

- PAPER / SHADOW / LIVE execution mode
- broker provider
- broker connection/trading permissions
- environment emergency stop
- persistent kill-switch
- arm state and quota
- unresolved reconciliation count
- shared infrastructure state
- strategy runtime
- startup recovery

The main dashboard includes a read-only Broker Execution Safety panel.

It intentionally contains no browser LIVE/ARM control buttons.

## Persistence & Recovery

Broker execution state is:

- durable JSON in LOCAL mode
- transactional shared state in SHARED mode

Local recovery snapshots include broker-execution.json.

Phase 9 shared migration also migrates broker execution state.

In SHARED/LIVE operation, PostgreSQL backup/PITR remains the authoritative disaster-recovery mechanism.

## Explicit Boundary

Phase 10 does not:

- enable LIVE by default
- store broker account passwords in browser code
- expose approval secrets to the client
- automatically retry uncertain submissions
- automatically bypass broker order_check
- automatically liquidate positions when kill-switch is engaged
- automatically change strategy parameters
- automatically promote or rollback strategies
- manage deposits, withdrawals, or account transfers

Kill-switch/emergency stop prevent new live submissions. Existing broker positions remain governed by their broker-side SL/TP and operator actions.

## Phase 10 Definition of Done

1. provider-neutral broker contract exists
2. shadow broker provider exists
3. MT5 broker provider exists
4. broker mode defaults OFF
5. live execution gate defaults false
6. environment emergency stop defaults true
7. persistent kill-switch defaults engaged
8. live symbol allowlist defaults empty
9. broker execution state is durable
10. shared broker execution state is transactional
11. broker state participates in startup recovery
12. broker state participates in local recovery snapshot
13. broker state participates in Phase 9 shared migration
14. deterministic broker idempotency key exists
15. repeated strategy signal is not auto-resubmitted
16. live risk percent has independent hard limit
17. live lot has independent hard limit
18. per-cycle live order count is bounded
19. open-position count is bounded
20. same-symbol exposure can be blocked
21. broker equity drawdown is gated
22. account currency must match risk-engine currency
23. broker volume normalization mismatch is rejected
24. frozen-entry price drift is gated
25. broker stops level is checked
26. broker account trading permission is checked
27. expert/algo trading permission is checked
28. terminal trading permission is checked
29. pinned ACTIVE release is required
30. strategy default drift blocks live execution
31. kill-switch disengage is explicitly gated
32. kill-switch engagement revokes live arm
33. arm is time-limited
34. arm is order-count-limited
35. arm quota is consumed conservatively
36. distributed broker execution lease exists
37. exact fencing grant is used for lease release
38. MT5 trade bridge is disabled by default
39. MT5 trade bridge requires bearer token
40. MT5 order_check precedes order_send
41. order submission requires explicit FSE-LIVE confirmation
42. known broker rejection is distinguished from transport uncertainty
43. uncertain submit is never automatically retried
44. unresolved submit blocks new live orders
45. read-only reconciliation exists
46. reconciliation matches FSE tag + magic
47. operator control API requires approval secret
48. browser dashboard never receives approval secret
49. broker safety panel is read-only
50. production health exposes Phase 10 controls
51. OFF and SHADOW retain no-live guarantees
52. Paper baseline continues to run
53. Phase 1–9 regression coverage remains intact
54. MT5 Python bridge syntax passes
55. TypeScript typecheck passes
56. Vitest passes
57. ESLint passes
58. Next.js production build passes

## Completion Gate

Phase 10 becomes COMPLETE only after the final branch head passes the full CI pipeline.

# Phase 10 Completion

**Phase 10 — Broker Integration & Live Execution Safety is complete.**

Completion means the broker abstraction, shadow/live safety architecture, MT5
trade bridge gates, idempotency, operator controls, reconciliation, health,
tests and operational runbook are implemented and regression-validated.

It does not mean live trading is enabled in a deployment.

The repository defaults remain:

    FSE_BROKER_MODE=off
    FSE_LIVE_EXECUTION_ENABLED=false
    FSE_LIVE_EMERGENCY_STOP=true

The system progression is now:

    Phase 1    Core decision engine
    Phase 2    Scanner engine
    Phase 3    Signal dashboard
    Phase 4    Deterministic Paper Trading
    Phase 5    Historical validation / backtest
    Phase 6    Strategy release runtime & governance
    Phase 7    Forward validation & drift monitoring
    Phase 8    Production hardening / reliability / recovery
    Phase 9    Transactional infrastructure / deployment architecture
    Phase 10   Broker integration / live execution safety

Any real-money rollout remains an explicit operator/deployment decision and
must follow docs/PHASE-10-LIVE-RUNBOOK.md.
