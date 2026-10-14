# Phase 10 — Broker Rollout & Emergency Runbook

Phase 10 code completion is not permission to trade real funds. Use this staged rollout so every live gate is observable before external submission is possible.

## Stage A — OFF

Start with:

    FSE_BROKER_MODE=off
    FSE_LIVE_EXECUTION_ENABLED=false
    FSE_LIVE_EMERGENCY_STOP=true

Confirm Phase 9 shared infrastructure, ACTIVE strategy release, Paper Trading, forward validation, health, and market data are stable.

## Stage B — SHADOW

To exercise broker preflight without order_send:

    FSE_BROKER_MODE=shadow
    FSE_BROKER_PROVIDER=mt5
    FSE_LIVE_EXECUTION_ENABLED=false
    FSE_LIVE_EMERGENCY_STOP=true

On the MT5 bridge host:

    MT5_TRADE_BRIDGE_ENABLED=true
    MT5_TRADE_BRIDGE_TOKEN=<strong secret>

On the FSE server use the same server-only token:

    MT5_TRADE_BRIDGE_TOKEN=<same secret>

Restart both processes.

Verify GET /api/broker shows SHADOW and MT5 connectivity.

Shadow mode may call /trade/check but never /trade/order.

Review execution records for:

- broker permission
- stop-level compatibility
- volume normalization
- account currency
- frozen-entry drift

Do not proceed while shadow preflight rejects normal intended orders unexpectedly.

## Stage C — Configure LIVE but keep hard-stopped

Configure:

    FSE_BROKER_MODE=live
    FSE_BROKER_PROVIDER=mt5
    FSE_LIVE_EXECUTION_ENABLED=true
    FSE_LIVE_EMERGENCY_STOP=true
    FSE_REQUIRE_SHARED_TX_STORE=true
    FSE_LIVE_APPROVAL_SECRET=<strong independent secret>
    FSE_LIVE_ALLOWED_SYMBOLS=EURUSD

Keep conservative risk defaults or lower them.

Restart FSE.

Expected state:

- LIVE mode selected
- environment emergency stop ENGAGED
- persistent kill-switch ENGAGED
- no arm approval
- liveReady=false
- no real order possible

## Stage D — Remove environment stop

Only in an explicitly supervised window:

    FSE_LIVE_EMERGENCY_STOP=false

Restart FSE.

The persistent kill-switch is still ENGAGED, so live orders remain blocked.

## Stage E — Disengage persistent kill-switch

Call POST /api/broker/control with header:

    X-FSE-Approval-Secret: <approval secret>

Body:

    {
      "action": "kill-switch",
      "engaged": false,
      "changedBy": "operator-id",
      "reason": "supervised Phase 10 live window"
    }

Live remains blocked because no arm approval exists.

## Stage F — Arm one bounded order

POST /api/broker/control with the same approval-secret header.

Body:

    {
      "action": "arm",
      "approvedBy": "operator-id",
      "reason": "single supervised live execution",
      "durationMinutes": 5,
      "maxOrders": 1
    }

Only now can an eligible scanner signal reach broker preflight/submission.

## During LIVE

Monitor:

- /api/system/health
- /api/broker
- /api/system/telemetry
- MT5 terminal journal
- broker open positions

One live intent must have one FSE client tag and one durable execution record.

## Ambiguous submit

If an execution record becomes RECONCILIATION_REQUIRED:

1. do not arm another order
2. new live orders are automatically blocked
3. inspect MT5 terminal/broker state
4. call POST /api/broker/reconcile with approval-secret header
5. if reconciliation remains NOT_FOUND, keep live execution stopped and review manually

Never manually retry the same signal merely because the HTTP response was lost.

## Emergency stop — application control

POST /api/broker/control:

    {
      "action": "kill-switch",
      "engaged": true,
      "changedBy": "operator-id",
      "reason": "emergency stop"
    }

Engaging kill-switch also revokes the active arm.

## Emergency stop — infrastructure control

If application/shared control state is unavailable:

    FSE_LIVE_EMERGENCY_STOP=true

Restart FSE.

This blocks new submissions independently from the database-backed control state.

## Important: existing positions

Neither kill-switch nor environment emergency stop forcibly closes an existing broker position.

Existing positions retain their broker-side stop loss/take profit. Position liquidation or modification is a separate operator/broker action.

## Return to safe mode

After a live window:

1. engage persistent kill-switch
2. set FSE_LIVE_EMERGENCY_STOP=true
3. set FSE_BROKER_MODE=shadow or off
4. restart FSE
5. verify /api/broker and /api/system/health

## Credential handling

Never commit:

- FSE_LIVE_APPROVAL_SECRET
- MT5_TRADE_BRIDGE_TOKEN
- broker login/password

The Python bridge uses the already logged-in local MT5 terminal. Phase 10 does not add broker-password fields to the web application.
