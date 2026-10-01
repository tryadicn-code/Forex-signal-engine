# Phase 11 — Telegram & WhatsApp Setup

## Realtime behavior

Alerts are generated as soon as a scanner cycle observes a qualifying lifecycle state. The trading engine still uses its existing closed-candle/no-look-ahead rules; notification code never changes that analysis cadence.

## Telegram recommended first

Telegram is the simplest first realtime channel.

1. Create a bot through BotFather in Telegram.
2. Copy the bot token.
3. Start a chat with the bot from the receiving Telegram account.
4. Obtain the target chat ID.
5. Configure .env.local:

    FSE_ALERTS_ENABLED=true
    FSE_TELEGRAM_ENABLED=true
    FSE_TELEGRAM_BOT_TOKEN=<token>
    FSE_TELEGRAM_CHAT_ID=<chat id>

Recommended first alert policy:

    FSE_ALERT_WATCH=false
    FSE_ALERT_NEAR_EXECUTE=true
    FSE_ALERT_EXECUTE=true
    FSE_ALERT_BLOCKED=false
    FSE_ALERT_INVALIDATED=true

Then restart npm run dev.

## Expected Telegram lifecycle

Example progression:

    ARMED / trigger WAITING
           ↓
    NEAR_EXECUTE notification
           ↓
    trigger CONFIRMED + risk approved + EXECUTE
           ↓
    EXECUTE_READY notification

If the setup is invalidated, INVALIDATED is a separate event and may be sent once.

## WhatsApp Cloud API

Configure Meta WhatsApp Cloud API credentials server-side:

    FSE_ALERTS_ENABLED=true
    FSE_WHATSAPP_ENABLED=true
    FSE_WHATSAPP_ACCESS_TOKEN=<token>
    FSE_WHATSAPP_PHONE_NUMBER_ID=<id>
    FSE_WHATSAPP_RECIPIENT=<international number>
    FSE_WHATSAPP_GRAPH_API_VERSION=<Meta app Graph API version>

Do not prefix the Graph API version with a URL; use the version token such as vXX.X.

### Proactive template mode

For alerts that need to be delivered outside a normal service conversation window, configure an approved template with one body variable:

    FSE_WHATSAPP_TEMPLATE_NAME=fse_signal_alert
    FSE_WHATSAPP_TEMPLATE_LANGUAGE=id

Without FSE_WHATSAPP_TEMPLATE_NAME the adapter sends a normal text message.

## Manual retry

Set:

    FSE_ALERT_ADMIN_SECRET=<strong secret>

Then call:

    POST /api/notifications

with:

    X-FSE-Alert-Admin-Secret: <same secret>

and body:

    { "action": "retry-failed" }

## Safe testing

Notification testing does not require live broker execution.

Keep Phase 10 safe defaults while validating alerts:

    FSE_BROKER_MODE=off
    FSE_LIVE_EXECUTION_ENABLED=false
    FSE_LIVE_EMERGENCY_STOP=true

You can use live market data with broker execution OFF and still receive signal alerts.

## Troubleshooting

If no alert arrives:

1. Open GET /api/notifications.
2. Confirm enabled=true.
3. Confirm the selected channel says configured/READY.
4. Check recentEvents.
5. Check pendingDeliveries and failedDeliveries.
6. Check Production Health notification warning.
7. Verify the signal actually reaches NEAR_EXECUTE or EXECUTE_READY.

Remember that NEAR_EXECUTE is intentionally strict and does not calculate provisional risk before the core Risk Engine is allowed to run.
