export type NotificationChannelId = "telegram" | "whatsapp";

export interface NotificationConfig {
  enabled: boolean;
  watchEnabled: boolean;
  nearExecuteEnabled: boolean;
  executeEnabled: boolean;
  blockedEnabled: boolean;
  invalidatedEnabled: boolean;
  nearExecuteBiasScore: number;
  nearExecuteSetupScore: number;
  nearExecuteTriggerScore: number;
  nearExecuteMinRiskReward: number;
  cooldownMs: number;
  maxAttempts: number;
  retryBaseMs: number;
  requestTimeoutMs: number;
  workerIntervalMs: number;
  timeZone: string;
  adminSecret: string | null;
  telegramEnabled: boolean;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  whatsappEnabled: boolean;
  whatsappAccessToken: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappRecipient: string | null;
  whatsappGraphApiVersion: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string;
}

export function resolveNotificationConfig(
  env: Record<string, string | undefined> = process.env
): NotificationConfig {
  return {
    enabled: parseBoolean(env.FSE_ALERTS_ENABLED, false),
    watchEnabled: parseBoolean(env.FSE_ALERT_WATCH, false),
    nearExecuteEnabled: parseBoolean(env.FSE_ALERT_NEAR_EXECUTE, true),
    executeEnabled: parseBoolean(env.FSE_ALERT_EXECUTE, true),
    blockedEnabled: parseBoolean(env.FSE_ALERT_BLOCKED, false),
    invalidatedEnabled: parseBoolean(env.FSE_ALERT_INVALIDATED, true),
    nearExecuteBiasScore: parseNonNegativeNumber(
      env.FSE_ALERT_NEAR_EXECUTE_BIAS_SCORE,
      60
    ),
    nearExecuteSetupScore: parseNonNegativeNumber(
      env.FSE_ALERT_NEAR_EXECUTE_SETUP_SCORE,
      70
    ),
    nearExecuteTriggerScore: parseNonNegativeNumber(
      env.FSE_ALERT_NEAR_EXECUTE_TRIGGER_SCORE,
      50
    ),
    nearExecuteMinRiskReward: parseNonNegativeNumber(
      env.FSE_ALERT_NEAR_EXECUTE_MIN_RR,
      1.5
    ),
    cooldownMs:
      parseNonNegativeInteger(env.FSE_ALERT_COOLDOWN_SECONDS, 300) * 1000,
    maxAttempts: parsePositiveInteger(
      env.FSE_ALERT_MAX_ATTEMPTS,
      5
    ),
    retryBaseMs: parsePositiveInteger(
      env.FSE_ALERT_RETRY_BASE_MS,
      5_000
    ),
    requestTimeoutMs: parsePositiveInteger(
      env.FSE_ALERT_REQUEST_TIMEOUT_MS,
      8_000
    ),
    workerIntervalMs: parsePositiveInteger(
      env.FSE_ALERT_WORKER_INTERVAL_MS,
      5_000
    ),
    timeZone: optional(env.FSE_ALERT_TIME_ZONE) ?? "Asia/Makassar",
    adminSecret: optional(env.FSE_ALERT_ADMIN_SECRET),
    telegramEnabled: parseBoolean(
      env.FSE_TELEGRAM_ENABLED,
      false
    ),
    telegramBotToken: optional(env.FSE_TELEGRAM_BOT_TOKEN),
    telegramChatId: optional(env.FSE_TELEGRAM_CHAT_ID),
    whatsappEnabled: parseBoolean(
      env.FSE_WHATSAPP_ENABLED,
      false
    ),
    whatsappAccessToken: optional(
      env.FSE_WHATSAPP_ACCESS_TOKEN
    ),
    whatsappPhoneNumberId: optional(
      env.FSE_WHATSAPP_PHONE_NUMBER_ID
    ),
    whatsappRecipient: optional(
      env.FSE_WHATSAPP_RECIPIENT
    ),
    whatsappGraphApiVersion: optional(
      env.FSE_WHATSAPP_GRAPH_API_VERSION
    ),
    whatsappTemplateName: optional(
      env.FSE_WHATSAPP_TEMPLATE_NAME
    ),
    whatsappTemplateLanguage:
      optional(env.FSE_WHATSAPP_TEMPLATE_LANGUAGE) ?? "id",
  };
}

export const NOTIFICATION_CONFIG = resolveNotificationConfig();

function optional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseNonNegativeNumber(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
