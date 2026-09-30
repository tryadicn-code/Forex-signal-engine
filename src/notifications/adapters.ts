import type {
  NotificationAdapter,
  NotificationSendResult,
} from "@/notifications/types";

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
          encodeURIComponent(this.options.botToken) +
          "/sendMessage",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: this.options.chatId,
            text: message.slice(0, 4096),
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
          cache: "no-store",
        }
      );
      const raw = await response.text();
      const parsed = raw
        ? (JSON.parse(raw) as {
            ok?: boolean;
            description?: string;
            result?: { message_id?: number };
          })
        : {};
      if (!response.ok || parsed.ok !== true) {
        throw new Error(
          "Telegram sendMessage failed: " +
            (parsed.description ??
              "HTTP " + response.status)
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
            authorization:
              "Bearer " + this.options.accessToken,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: this.options.recipient,
            type: "text",
            text: {
              preview_url: false,
              body: message.slice(0, 4096),
            },
          }),
          signal: controller.signal,
          cache: "no-store",
        }
      );
      const raw = await response.text();
      const parsed = raw
        ? (JSON.parse(raw) as {
            messages?: Array<{ id?: string }>;
            error?: { message?: string };
          })
        : {};
      if (!response.ok) {
        throw new Error(
          "WhatsApp Cloud API send failed: " +
            (parsed.error?.message ??
              "HTTP " + response.status)
        );
      }
      return {
        providerMessageId:
          parsed.messages?.[0]?.id ?? null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
