import {
  NotificationDeliveryError,
  type NotificationAdapter,
  type NotificationSendResult,
} from "@/notifications/types";

const TELEGRAM_TEXT_LIMIT = 4096;
const WHATSAPP_TEXT_LIMIT = 4096;
/** WhatsApp Cloud API body parameters are limited to 1024 characters. */
const WHATSAPP_TEMPLATE_PARAM_LIMIT = 1024;
/** Fallback retry delay for WhatsApp throttling when no explicit hint exists. */
const WHATSAPP_THROTTLE_FALLBACK_MS = 5 * 60_000;

/**
 * N8B-2: sanitize a provider error message before it is stored in
 * `delivery.lastError`. Provider responses can echo back phone numbers,
 * phone number IDs, or long opaque tokens.
 */
function sanitizeProviderError(raw: string, maxLength = 200): string {
  let cleaned = raw;
  cleaned = cleaned.replace(/\+?\d[\d\s\-()]{7,}\d/g, "<redacted>");
  cleaned = cleaned.replace(/[A-Za-z0-9_-]{30,}/g, "<token>");
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + "\u2026";
  }
  return cleaned;
}

/**
 * N8B-5: parse a JSON body safely. A non-JSON 200 response from a corporate
 * proxy or error page would otherwise surface as a bare SyntaxError.
 */
function parseJsonBody(
  raw: string,
  label: string,
  status: number
): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    const snippet = raw.length > 200 ? raw.slice(0, 200) + "..." : raw;
    const reason = error instanceof Error ? error.message : String(error);
    throw new NotificationDeliveryError(
      label +
        " returned non-JSON (HTTP " +
        status +
        "): " +
        reason +
        ". Body: " +
        snippet,
      null,
      status,
      null
    );
  }
}

interface TelegramAdapterOptions {
  botToken: string;
  chatId: string;
  timeoutMs: number;
}

export class TelegramNotificationAdapter
  implements NotificationAdapter
{
  readonly channel = "telegram" as const;

  constructor(private readonly options: TelegramAdapterOptions) {}

  async send(message: string): Promise<NotificationSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs
    );
    try {
      const response = await fetch(
        "https://api.telegram.org/bot" +
          this.options.botToken +
          "/sendMessage",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: this.options.chatId,
            text: message.slice(0, TELEGRAM_TEXT_LIMIT),
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
          cache: "no-store",
        }
      );
      const requestId = response.headers?.get?.("x-request-id") ?? null;
      const raw = await response.text();
      const parsed = parseJsonBody(raw, "Telegram", response.status) as {
        ok?: boolean;
        description?: string;
        error_code?: number;
        parameters?: { retry_after?: number };
        result?: { message_id?: number };
      };

      if (!response.ok || parsed.ok !== true) {
        // N8B-4: Telegram signals rate limits with HTTP 429 + error_code 429
        // and a `parameters.retry_after` value in seconds.
        const retryAfterMs =
          parsed.error_code === 429 &&
          typeof parsed.parameters?.retry_after === "number"
            ? parsed.parameters.retry_after * 1000
            : response.status === 429
              ? 60_000
              : null;
        throw new NotificationDeliveryError(
          "Telegram sendMessage failed: " +
            sanitizeProviderError(
              parsed.description ?? "HTTP " + response.status
            ),
          retryAfterMs,
          response.status,
          requestId
        );
      }
      return {
        providerMessageId:
          parsed.result?.message_id == null
            ? null
            : String(parsed.result.message_id),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

interface WhatsAppAdapterOptions {
  accessToken: string;
  phoneNumberId: string;
  recipient: string;
  graphApiVersion: string;
  templateName?: string | null;
  templateLanguage?: string;
  timeoutMs: number;
}

export class WhatsAppNotificationAdapter
  implements NotificationAdapter
{
  readonly channel = "whatsapp" as const;

  constructor(private readonly options: WhatsAppAdapterOptions) {}

  async send(message: string): Promise<NotificationSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs
    );
    try {
      const isTemplate = Boolean(this.options.templateName);
      const limit = isTemplate
        ? WHATSAPP_TEMPLATE_PARAM_LIMIT
        : WHATSAPP_TEXT_LIMIT;
      const text =
        message.length > limit
          ? message.slice(0, limit - 3) + "..."
          : message;

      const response = await fetch(
        "https://graph.facebook.com/" +
          encodeURIComponent(this.options.graphApiVersion) +
          "/" +
          encodeURIComponent(this.options.phoneNumberId) +
          "/messages",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + this.options.accessToken,
          },
          body: JSON.stringify(
            isTemplate
              ? {
                  messaging_product: "whatsapp",
                  recipient_type: "individual",
                  to: this.options.recipient,
                  type: "template",
                  template: {
                    name: this.options.templateName,
                    language: {
                      code: this.options.templateLanguage ?? "id",
                    },
                    components: [
                      {
                        type: "body",
                        parameters: [{ type: "text", text }],
                      },
                    ],
                  },
                }
              : {
                  messaging_product: "whatsapp",
                  recipient_type: "individual",
                  to: this.options.recipient,
                  type: "text",
                  text: { preview_url: false, body: text },
                }
          ),
          signal: controller.signal,
          cache: "no-store",
        }
      );
      // Meta returns x-fb-trace-id; some proxies mirror it as x-request-id.
      const requestId =
        response.headers?.get?.("x-fb-trace-id") ??
        response.headers?.get?.("x-request-id") ??
        null;

      const raw = await response.text();
      const parsed = parseJsonBody(raw, "WhatsApp", response.status) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string; code?: number };
      };

      if (!response.ok) {
        // N8B-4: Meta throttle codes are 130429 (rate limit hit) and 131056
        // (pair rate limit). Meta does not return an explicit retry_after
        // value, so we use a conservative fixed fallback.
        const isThrottle =
          response.status === 429 ||
          parsed.error?.code === 130429 ||
          parsed.error?.code === 131056;
        const retryAfterMs = isThrottle
          ? WHATSAPP_THROTTLE_FALLBACK_MS
          : null;
        throw new NotificationDeliveryError(
          "WhatsApp Cloud API send failed: " +
            sanitizeProviderError(
              parsed.error?.message ?? "HTTP " + response.status
            ),
          retryAfterMs,
          response.status,
          requestId
        );
      }
      return {
        providerMessageId: parsed.messages?.[0]?.id ?? null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}