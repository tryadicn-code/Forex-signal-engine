import { describe, expect, it } from "vitest";
import { resolveNotificationConfig } from "@/config/notifications";

describe("Phase 11 notification configuration", () => {
  it("defaults to alerts disabled with safe channel defaults", () => {
    const config = resolveNotificationConfig({});
    expect(config.enabled).toBe(false);
    expect(config.nearExecuteEnabled).toBe(true);
    expect(config.executeEnabled).toBe(true);
    expect(config.telegramEnabled).toBe(false);
    expect(config.whatsappEnabled).toBe(false);
    expect(config.telegramBotToken).toBeNull();
    expect(config.whatsappAccessToken).toBeNull();
    expect(config.timeZone).toBe("Asia/Makassar");
  });

  it("parses deterministic near-execute thresholds and channels", () => {
    const config = resolveNotificationConfig({
      FSE_ALERTS_ENABLED: "true",
      FSE_ALERT_NEAR_EXECUTE_BIAS_SCORE: "65",
      FSE_ALERT_NEAR_EXECUTE_SETUP_SCORE: "72",
      FSE_ALERT_NEAR_EXECUTE_TRIGGER_SCORE: "80",
      FSE_ALERT_NEAR_EXECUTE_MIN_RR: "1.8",
      FSE_ALERT_COOLDOWN_SECONDS: "120",
      FSE_TELEGRAM_ENABLED: "true",
      FSE_TELEGRAM_BOT_TOKEN: "123:abc",
      FSE_TELEGRAM_CHAT_ID: "456",
      FSE_WHATSAPP_ENABLED: "true",
      FSE_WHATSAPP_ACCESS_TOKEN: "wa-token",
      FSE_WHATSAPP_PHONE_NUMBER_ID: "phone-id",
      FSE_WHATSAPP_RECIPIENT: "628123",
      FSE_WHATSAPP_GRAPH_API_VERSION: "v99.0",
    });

    expect(config.enabled).toBe(true);
    expect(config.nearExecuteBiasScore).toBe(65);
    expect(config.nearExecuteSetupScore).toBe(72);
    expect(config.nearExecuteTriggerScore).toBe(80);
    expect(config.nearExecuteMinRiskReward).toBe(1.8);
    expect(config.cooldownMs).toBe(120_000);
    expect(config.telegramEnabled).toBe(true);
    expect(config.whatsappEnabled).toBe(true);
    expect(config.whatsappGraphApiVersion).toBe("v99.0");
  });
});
