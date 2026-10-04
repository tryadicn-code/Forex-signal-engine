import type {
  NotificationAdapter,
  NotificationSendResult,
} from "@/notifications/types";

const TELEGRAM_TEXT_LIMIT = 4096;
const WHATSAPP_TEXT_LIMIT = 4096;
/** WhatsApp Cloud API body parameters are limited to 1024 characters. */
const WHATSAPP_TEMPLATE_PARAM_LIMIT = 1024;

/**
 * N8B-2: sanitize a provider error message before it is stored in
 * `delivery.lastError`. Provider responses can echo back phone numbers,
 * phone number IDs, or long opaque tokens. Truncate to a bounded length and
 * redact anything that looks like a phone number or a long identifier.
 */
function sanitizeProviderError(raw: string, maxLength = 200): string {
  let cleaned = raw;
  // Redact E.164-ish phone numbers (+628123456789, 62812-3456-789, etc.)
  cleaned = cleaned.replace(/\+?\d[\d\s\-()]{7,}\d/g, "<redacted>");
  // Redact long alphanumeric tokens (30+ chars) that may be session ids
  cleaned = cleaned.replace(/[A-Za-z0-9_-]{30,}/g, "<token>");
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + "\u2026";
  }
  return cleaned;
}

/**
 * N8B-5: parse a JSON body safely. A non-JSON 200 response from a corporate
 * proxy or error page would otherwise surface as "Unexpected token < in JSON
 * at position 0" with no context.
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
    throw new Error(
      label +
        " returned non-JSON (HTTP " +
        status +
        "): " +
        reason +
        ". Body: " +
        snippet
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
      const raw = await response.text();
      const parsed = parseJsonBody(raw, "Telegram", response.status) as {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      };
      if (!response.ok || parsed.ok !== true) {
        throw new Error(
          "Telegram sendMessage failed: " +
            sanitizeProviderError(
              parsed.description ?? "HTTP " + response.status
            )
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
      // N8B-3: text mode allows up to 4096 chars, but the template body
      // parameter is limited to 1024. Truncate per mode, and mark the
      // truncation with an ellipsis so the recipient knows the message
      // was cut.
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
      const raw = await response.text();
      const parsed = parseJsonBody(raw, "WhatsApp", response.status) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          "WhatsApp Cloud API send failed: " +
            sanitizeProviderError(
              parsed.error?.message ?? "HTTP " + response.status
            )
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