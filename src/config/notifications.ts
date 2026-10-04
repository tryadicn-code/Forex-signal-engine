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
      60,
      "FSE_ALERT_NEAR_EXECUTE_BIAS_SCORE"
    ),
    nearExecuteSetupScore: parseNonNegativeNumber(
      env.FSE_ALERT_NEAR_EXECUTE_SETUP_SCORE,
      70,
      "FSE_ALERT_NEAR_EXECUTE_SETUP_SCORE"
    ),
    nearExecuteTriggerScore: parseNonNegativeNumber(
      env.FSE_ALERT_NEAR_EXECUTE_TRIGGER_SCORE,
      50,
      "FSE_ALERT_NEAR_EXECUTE_TRIGGER_SCORE"
    ),
    nearExecuteMinRiskReward: parseNonNegativeNumber(
      env.FSE_ALERT_NEAR_EXECUTE_MIN_RR,
      1.5,
      "FSE_ALERT_NEAR_EXECUTE_MIN_RR"
    ),
    cooldownMs:
      parseNonNegativeInteger(
      env.FSE_ALERT_COOLDOWN_SECONDS,
      300,
      "FSE_ALERT_COOLDOWN_SECONDS"
    ) * 1000,
    maxAttempts: parsePositiveInteger(
      env.FSE_ALERT_MAX_ATTEMPTS,
      5,
      "FSE_ALERT_MAX_ATTEMPTS"
    ),
    retryBaseMs: parsePositiveInteger(
      env.FSE_ALERT_RETRY_BASE_MS,
      5_000,
      "FSE_ALERT_RETRY_BASE_MS"
    ),
    requestTimeoutMs: parsePositiveInteger(
      env.FSE_ALERT_REQUEST_TIMEOUT_MS,
      8_000,
      "FSE_ALERT_REQUEST_TIMEOUT_MS"
    ),
    workerIntervalMs: parsePositiveInteger(
      env.FSE_ALERT_WORKER_INTERVAL_MS,
      5_000,
      "FSE_ALERT_WORKER_INTERVAL_MS"
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
    whatsappGraphApiVersion: parseGraphApiVersion(
      env.FSE_WHATSAPP_GRAPH_API_VERSION
    ),
    whatsappTemplateName: optional(
      env.FSE_WHATSAPP_TEMPLATE_NAME
    ),
    whatsappTemplateLanguage:
      optional(env.FSE_WHATSAPP_TEMPLATE_LANGUAGE) ?? "id",
  };
}

/**
 * N8B-6: reject non-integer and non-numeric env values instead of silently
 * falling back to the default. The operator might otherwise believe a typo
 * was accepted.
 */
function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  label: string
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      "Invalid positive integer for " + label + ': "' + value + '".'
    );
  }
  return parsed;
}

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
  label: string
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      "Invalid non-negative integer for " + label + ': "' + value + '".'
    );
  }
  return parsed;
}

function parseNonNegativeNumber(
  value: string | undefined,
  fallback: number,
  label: string
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      "Invalid non-negative number for " + label + ': "' + value + '".'
    );
  }
  return parsed;
}

/**
 * N8B-9: Meta's Graph API version must match vNN.N. Anything else produces
 * a confusing 400 later. Validate here so config failure is loud and early.
 */
function parseGraphApiVersion(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^v\d+\.\d+$/.test(trimmed)) {
    throw new Error(
      'FSE_WHATSAPP_GRAPH_API_VERSION must match "vNN.N" (got "' +
        trimmed +
        '").'
    );
  }
  return trimmed;
}

function safeNotificationDefaults(): NotificationConfig {
  return {
    enabled: false,
    watchEnabled: false,
    nearExecuteEnabled: true,
    executeEnabled: true,
    blockedEnabled: false,
    invalidatedEnabled: true,
    nearExecuteBiasScore: 60,
    nearExecuteSetupScore: 70,
    nearExecuteTriggerScore: 50,
    nearExecuteMinRiskReward: 1.5,
    cooldownMs: 300_000,
    maxAttempts: 5,
    retryBaseMs: 5_000,
    requestTimeoutMs: 8_000,
    workerIntervalMs: 5_000,
    timeZone: "Asia/Makassar",
    adminSecret: null,
    telegramEnabled: false,
    telegramBotToken: null,
    telegramChatId: null,
    whatsappEnabled: false,
    whatsappAccessToken: null,
    whatsappPhoneNumberId: null,
    whatsappRecipient: null,
    whatsappGraphApiVersion: null,
    whatsappTemplateName: null,
    whatsappTemplateLanguage: "id",
  };
}

let _notificationConfigError: string | null = null;
export function getNotificationConfigError(): string | null {
  return _notificationConfigError;
}

function loadNotificationConfigSafely(): NotificationConfig {
  try {
    return resolveNotificationConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    _notificationConfigError = message;
    console.error(
      "[notifications-config] Invalid notification environment detected. " +
        "Falling back to safe defaults (all channels disabled). " +
        "Reason: " +
        message
    );
    return safeNotificationDefaults();
  }
}
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




export const NOTIFICATION_CONFIG = loadNotificationConfigSafely();
