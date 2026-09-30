import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TelegramNotificationAdapter,
  WhatsAppNotificationAdapter,
} from "@/notifications/adapters";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Phase 11 notification adapters", () => {
  it("sends Telegram text through Bot API sendMessage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          result: { message_id: 42 },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new TelegramNotificationAdapter({
      botToken: "123:abc",
      chatId: "456",
      timeoutMs: 1000,
    });
    const result = await adapter.send("hello");

    expect(result.providerMessageId).toBe("42");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/sendMessage");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      chat_id: "456",
      text: "hello",
    });
  });

  it("can send WhatsApp proactive alert through an approved template", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          messages: [{ id: "wamid.template" }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new WhatsAppNotificationAdapter({
      accessToken: "token",
      phoneNumberId: "phone",
      recipient: "628123",
      graphApiVersion: "v99.0",
      templateName: "fse_alert",
      templateLanguage: "id",
      timeoutMs: 1000,
    });
    await adapter.send("EURUSD near execute");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("fse_alert");
    expect(body.template.language.code).toBe("id");
    expect(body.template.components[0].parameters[0].text).toBe(
      "EURUSD near execute"
    );
  });

  it("sends WhatsApp text through configured Graph API version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          messages: [{ id: "wamid.1" }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new WhatsAppNotificationAdapter({
      accessToken: "token",
      phoneNumberId: "phone",
      recipient: "628123",
      graphApiVersion: "v99.0",
      timeoutMs: 1000,
    });
    const result = await adapter.send("hello");

    expect(result.providerMessageId).toBe("wamid.1");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://graph.facebook.com/v99.0/phone/messages"
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      messaging_product: "whatsapp",
      to: "628123",
      type: "text",
    });
  });
});
