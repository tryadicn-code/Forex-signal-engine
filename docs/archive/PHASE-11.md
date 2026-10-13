# Phase 11 — Realtime Alerting & Notification Infrastructure

**Status: COMPLETE**

Phase 11 adds durable, realtime notifications for scanner lifecycle events without changing trading decisions or broker execution semantics.

"Realtime" here means immediate notification after the scanner observes a new state. The strategy remains closed-candle/no-look-ahead; Phase 11 does not introduce tick-by-tick or intrabar strategy evaluation. End-to-end alert latency is therefore bounded by scanner cadence plus the notification worker interval.

## Safety Boundary

Notifications are observers only.

- Alert evaluation reads existing scanner output.
- Alert code does not modify strategy scores or state.
- Alert delivery is not awaited by Paper or broker execution.
- Telegram/WhatsApp outages do not block scanner execution.
- Delivery state is durable and restart-safe.

## Alert States

Supported alert states:

- WATCH
- NEAR_EXECUTE
- EXECUTE_READY
- BLOCKED
- INVALIDATED

Default enabled states:

    NEAR_EXECUTE = true
    EXECUTE_READY = true
    INVALIDATED = true
    WATCH = false
    BLOCKED = false

## NEAR_EXECUTE Semantics

The core engine intentionally does not run the Risk Engine until the trigger is CONFIRMED. Therefore Phase 11 must not require risk approval while the trigger is still WAITING.

NEAR_EXECUTE means:

- symbol analysis succeeded
- market data is FRESH
- bias direction is LONG or SHORT
- setup state is ARMED
- execution decision is WAIT
- trigger state is WAITING
- no hard execution veto is present
- absolute bias score meets the alert threshold
- setup score meets the alert threshold
- trigger readiness score meets the alert threshold
- if an R:R value is already available, it must meet the optional R:R floor

Risk remains explicitly pending and the alert includes RISK_EVALUATION in the waiting list when the Risk Engine has not run.

Default thresholds:

    bias score >= 60
    setup score >= 70
    trigger score >= 50
    R:R floor if available >= 1.5

## Deduplication & Cooldown

Event identity:

    strategy version
    strategy activation epoch
    signal ID
    alert state

The exact same signal/state is emitted once.

A second signal for the same symbol and alert state inside the configured cooldown is recorded as SUPPRESSED and does not create external deliveries.

Default cooldown:

    300 seconds

## Durable Outbox

Notification state contains:

- durable alert event audit records
- per-channel delivery records
- attempt counts
- provider message IDs
- retry schedule
- last delivery error

LOCAL mode stores this in notifications.json with Phase 8 durable JSON checksums/backups.

SHARED mode stores it in the Phase 9 transactional state document:

    state/notifications

## Delivery Worker

A server-side worker drains due notification deliveries independently of scanner/broker execution.

Default worker interval:

    5000 ms

SHARED mode uses the distributed lease:

    notification-delivery

Only one runtime instance drains the outbox at a time.

One delivery is attempted at most once per drain cycle. Retry uses bounded exponential backoff.

## Telegram

Telegram uses the HTTPS Bot API sendMessage method.

Required configuration:

    FSE_TELEGRAM_ENABLED=true
    FSE_TELEGRAM_BOT_TOKEN=<bot token>
    FSE_TELEGRAM_CHAT_ID=<chat id>

Messages are plain text so engine content never needs Telegram markup escaping.

## WhatsApp Cloud API

Required configuration:

    FSE_WHATSAPP_ENABLED=true
    FSE_WHATSAPP_ACCESS_TOKEN=<token>
    FSE_WHATSAPP_PHONE_NUMBER_ID=<phone number id>
    FSE_WHATSAPP_RECIPIENT=<recipient>
    FSE_WHATSAPP_GRAPH_API_VERSION=<version configured for the Meta app>

Free-form text mode is supported.

For proactive messages outside an active service conversation, an approved template can be configured:

    FSE_WHATSAPP_TEMPLATE_NAME=<approved template>
    FSE_WHATSAPP_TEMPLATE_LANGUAGE=id

The configured template is expected to contain one body text variable that receives the formatted FSE alert.

## Retry Behavior

Default:

    max attempts = 5
    retry base = 5000 ms

Retries are durable. Failed deliveries remain visible in the dashboard and production health.

Manual retry endpoint:

    POST /api/notifications

Header:

    X-FSE-Alert-Admin-Secret: <FSE_ALERT_ADMIN_SECRET>

Body:

    { "action": "retry-failed" }

## API

Read-only alert dashboard:

    GET /api/notifications

Manual retry:

    POST /api/notifications

## Dashboard

Phase 11 adds a read-only Signal Notification Center showing:

- alerts enabled/off
- Telegram/WhatsApp readiness
- pending deliveries
- failed deliveries
- sent deliveries
- near-execute thresholds
- recent alert events
- per-event delivery state

Credentials and admin secrets are never sent to the browser.

## Health / Recovery / Migration

Production health protocol is phase-11-health-v1.

Alert misconfiguration or delivery failures degrade health but never block scanner or broker execution.

Notification state participates in:

- startup recovery as a non-critical domain
- local recovery snapshots
- Phase 9 local-to-shared migration
- local persistence integrity inspection

## Phase 11 Definition of Done

1. provider-neutral notification adapter contract exists
2. Telegram adapter exists
3. WhatsApp Cloud API adapter exists
4. WhatsApp approved-template mode exists
5. alerts default OFF
6. WATCH alert is configurable
7. NEAR_EXECUTE alert is configurable
8. EXECUTE_READY alert is configurable
9. BLOCKED alert is configurable
10. INVALIDATED alert is configurable
11. near-execute semantics match the real engine pipeline
12. near-execute does not pretend risk was evaluated early
13. deterministic alert event identity exists
14. exact signal/state dedup exists
15. same-symbol/state cooldown exists
16. suppressed events are auditable
17. durable event store exists
18. durable delivery outbox exists
19. local durable persistence exists
20. shared transactional persistence exists
21. delivery worker exists
22. distributed delivery lease exists
23. one attempt per delivery per drain cycle is enforced
24. bounded retry/backoff exists
25. provider message IDs are persisted
26. failed delivery errors are persisted
27. scanner does not await external notification HTTP
28. notification failure cannot change engine decision
29. notification failure cannot block broker execution
30. read-only notification API exists
31. protected manual retry API exists
32. dashboard notification center exists
33. channel readiness is visible
34. pending/failed/sent counts are visible
35. production health includes notifications
36. notification problems degrade rather than block readiness
37. notification state is included in startup recovery
38. notification state is included in local recovery snapshots
39. notification state is included in shared migration
40. notification storage path is cross-platform
41. secrets remain server-side
42. Telegram adapter tests exist
43. WhatsApp text/template adapter tests exist
44. detector tests exist
45. dedup/cooldown tests exist
46. retry tests exist
47. Phase 1–10 regression coverage remains intact
48. TypeScript typecheck passes
49. all Vitest tests pass
50. ESLint passes
51. Next.js production build passes

## Completion Gate

Phase 11 is marked COMPLETE only after the final branch head passes the full CI pipeline.


# Phase 11 Completion

**Phase 11 — Realtime Alerting & Notification Infrastructure is complete.**

Completion means alert detection, deduplication/cooldown, durable outbox,
Telegram and WhatsApp adapters, background delivery worker, recovery/migration
integration, production health, read-only UI observability, and regression
coverage are implemented.

Alerts remain disabled by default. Notification delivery does not modify engine,
Paper Trading, or broker decisions.

System progression:

    Phase 1    Core decision engine
    Phase 2    Automated scanner
    Phase 3    Professional dashboard
    Phase 4    Deterministic Paper Trading
    Phase 5    Historical validation / backtest
    Phase 6    Strategy release runtime & governance
    Phase 7    Forward validation & drift monitoring
    Phase 8    Production hardening / recovery
    Phase 9    Transactional infrastructure
    Phase 10   Broker integration / live execution safety
    Phase 11   Realtime alerting / notification infrastructure
