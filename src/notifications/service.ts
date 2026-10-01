import type { NotificationConfig } from "@/config/notifications";
import {
  alertRecordId,
  detectAlertCandidate,
} from "@/notifications/detector";
import { formatAlertMessage } from "@/notifications/message";
import type { NotificationStore } from "@/notifications/store";
import type {
  AlertCandidate,
  AlertEventRecord,
  NotificationAdapter,
  NotificationChannelHealth,
  NotificationDashboard,
  NotificationDelivery,
  NotificationStoreState,
} from "@/notifications/types";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { ScannerSnapshot } from "@/scanner/scanner-result";

export class NotificationService {
  constructor(
    private readonly store: NotificationStore,
    private readonly config: NotificationConfig,
    private readonly adapters: Map<string, NotificationAdapter>,
    private readonly timeZone: string
  ) {}

  async processSnapshot(
    snapshot: ScannerSnapshot,
    release: ReleaseRuntimeState
  ): Promise<number> {
    if (!this.config.enabled) return 0;

    let created = 0;
    for (const result of snapshot.results) {
      const candidate = detectAlertCandidate(
        result,
        release,
        this.config,
        snapshot.completedAt ?? Date.now()
      );
      if (!candidate) continue;
      if (await this.enqueueCandidate(candidate)) created += 1;
    }

    return created;
  }

  async dashboard(): Promise<NotificationDashboard> {
    try {
      const state = await this.store.read();
      return {
        ...this.dashboardBase(),
        recentEvents: [...state.events]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 100),
        pendingDeliveries: state.deliveries.filter(
          (item) =>
            item.status === "PENDING" ||
            item.status === "SENDING"
        ).length,
        failedDeliveries: state.deliveries.filter(
          (item) => item.status === "FAILED"
        ).length,
        sentDeliveries: state.deliveries.filter(
          (item) => item.status === "SENT"
        ).length,
        error: null,
      };
    } catch (error) {
      return {
        ...this.dashboardBase(),
        recentEvents: [],
        pendingDeliveries: 0,
        failedDeliveries: 0,
        sentDeliveries: 0,
        error:
          error instanceof Error ? error.message : String(error),
      };
    }
  }

  async readState(): Promise<NotificationStoreState> {
    return this.store.read();
  }

  async drainDueDeliveries(limit = 10): Promise<number> {
    if (!this.config.enabled) return 0;
    let processed = 0;
    const dueBefore = Date.now();

    for (let index = 0; index < limit; index += 1) {
      const delivery = await this.claimNextDueDelivery(dueBefore);
      if (!delivery) break;
      processed += 1;
      await this.deliver(delivery);
    }

    return processed;
  }

  async retryFailed(): Promise<number> {
    const now = Date.now();
    return this.store.update((state) => {
      let retried = 0;
      const next = structuredClone(state);
      for (const delivery of next.deliveries) {
        if (delivery.status !== "FAILED") continue;
        if (delivery.attempts >= delivery.maxAttempts) {
          delivery.attempts = 0;
        }
        delivery.status = "PENDING";
        delivery.nextAttemptAt = now;
        delivery.claimedAt = null;
        delivery.lastError = null;
        delivery.updatedAt = now;
        retried += 1;
      }
      for (const event of next.events) {
        if (
          event.status === "FAILED" ||
          event.status === "PARTIAL"
        ) {
          event.status = "QUEUED";
          event.updatedAt = now;
        }
      }
      return { next, result: retried };
    });
  }

  private async enqueueCandidate(
    candidate: AlertCandidate
  ): Promise<boolean> {
    const now = candidate.detectedAt;
    const message = formatAlertMessage(candidate, this.timeZone);
    const requestedChannels = this.requestedChannels();

    return this.store.update((state) => {
      if (
        state.events.some((event) => event.key === candidate.key)
      ) {
        return { next: state, result: false };
      }

      const cooldownMatch = [...state.events]
        .reverse()
        .find(
          (event) =>
            event.symbol === candidate.symbol &&
            event.state === candidate.state &&
            event.status !== "SUPPRESSED"
        );
      const suppressed =
        cooldownMatch != null &&
        now - cooldownMatch.detectedAt < this.config.cooldownMs;

      const eventId = alertRecordId(candidate.key);
      const event: AlertEventRecord = {
        ...candidate,
        id: eventId,
        status: suppressed
          ? "SUPPRESSED"
          : requestedChannels.length === 0
            ? "FAILED"
            : "QUEUED",
        channels: [...requestedChannels],
        sentChannels: [],
        failedChannels: [],
        message,
        updatedAt: now,
      };

      const deliveries: NotificationDelivery[] = suppressed
        ? []
        : requestedChannels.map((channel) => {
            const configured = this.adapters.has(channel);
            return {
              id: eventId + "-" + channel,
              eventId,
              eventKey: candidate.key,
              channel,
              status: configured ? "PENDING" : "FAILED",
              attempts: 0,
              maxAttempts: this.config.maxAttempts,
              nextAttemptAt: now,
              claimedAt: null,
              lastError: configured
                ? null
                : "Notification channel is enabled but not configured.",
              providerMessageId: null,
              createdAt: now,
              updatedAt: now,
              message,
            };
          });

      if (
        deliveries.length > 0 &&
        deliveries.every((item) => item.status === "FAILED")
      ) {
        event.status = "FAILED";
        event.failedChannels = deliveries.map(
          (item) => item.channel
        );
      }

      const next: NotificationStoreState = {
        ...state,
        events: [...state.events, event].slice(-1000),
        deliveries: [...state.deliveries, ...deliveries].slice(-2000),
      };
      return { next, result: true };
    });
  }

  private async claimNextDueDelivery(
    dueBefore: number
  ): Promise<NotificationDelivery | null> {
    const now = Date.now();
    const staleBefore =
      now - Math.max(this.config.requestTimeoutMs * 2, 30_000);

    return this.store.update((state) => {
      const next = structuredClone(state);

      for (const item of next.deliveries) {
        if (
          item.status === "SENDING" &&
          item.claimedAt !== null &&
          item.claimedAt <= staleBefore
        ) {
          item.status = "PENDING";
          item.claimedAt = null;
          item.nextAttemptAt = now;
          item.lastError =
            "Recovered stale delivery claim after worker interruption.";
          item.updatedAt = now;
        }
      }

      const candidate = next.deliveries
        .filter(
          (item) =>
            item.status === "PENDING" &&
            item.nextAttemptAt <= dueBefore
        )
        .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)[0];

      if (!candidate) {
        return { next, result: null };
      }

      candidate.status = "SENDING";
      candidate.claimedAt = now;
      candidate.attempts += 1;
      candidate.updatedAt = now;
      return { next, result: structuredClone(candidate) };
    });
  }

  private async deliver(delivery: NotificationDelivery): Promise<void> {
    const adapter = this.adapters.get(delivery.channel);
    if (!adapter) {
      await this.completeDelivery(
        delivery,
        false,
        null,
        "Notification channel adapter is unavailable."
      );
      return;
    }

    try {
      const result = await adapter.send(delivery.message);
      await this.completeDelivery(
        delivery,
        true,
        result.providerMessageId,
        null
      );
    } catch (error) {
      await this.completeDelivery(
        delivery,
        false,
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async completeDelivery(
    claimed: NotificationDelivery,
    success: boolean,
    providerMessageId: string | null,
    error: string | null
  ): Promise<void> {
    const now = Date.now();
    await this.store.update((state) => {
      const next = structuredClone(state);
      const delivery = next.deliveries.find(
        (item) => item.id === claimed.id
      );
      if (!delivery || delivery.status !== "SENDING") {
        return { next, result: null };
      }

      if (success) {
        delivery.status = "SENT";
        delivery.providerMessageId = providerMessageId;
        delivery.lastError = null;
      } else if (delivery.attempts >= delivery.maxAttempts) {
        delivery.status = "FAILED";
        delivery.lastError = error;
      } else {
        delivery.status = "PENDING";
        delivery.lastError = error;
        delivery.nextAttemptAt =
          now +
          this.config.retryBaseMs *
            Math.pow(2, Math.max(0, delivery.attempts - 1));
      }
      delivery.claimedAt = null;
      delivery.updatedAt = now;

      this.refreshEventStatus(next, delivery.eventId, now);
      return { next, result: null };
    });
  }

  private refreshEventStatus(
    state: NotificationStoreState,
    eventId: string,
    now: number
  ): void {
    const event = state.events.find((item) => item.id === eventId);
    if (!event) return;
    const deliveries = state.deliveries.filter(
      (item) => item.eventId === eventId
    );
    const sent = deliveries
      .filter((item) => item.status === "SENT")
      .map((item) => item.channel);
    const failed = deliveries
      .filter((item) => item.status === "FAILED")
      .map((item) => item.channel);
    const pending = deliveries.some(
      (item) =>
        item.status === "PENDING" ||
        item.status === "SENDING"
    );

    event.sentChannels = [...new Set(sent)];
    event.failedChannels = [...new Set(failed)];
    event.status = pending
      ? "QUEUED"
      : sent.length === deliveries.length && deliveries.length > 0
        ? "SENT"
        : sent.length > 0
          ? "PARTIAL"
          : "FAILED";
    event.updatedAt = now;
  }

  private dashboardBase(): Omit<
    NotificationDashboard,
    | "recentEvents"
    | "pendingDeliveries"
    | "failedDeliveries"
    | "sentDeliveries"
    | "error"
  > {
    return {
      protocol: "phase-11-alert-dashboard-v1",
      generatedAt: Date.now(),
      enabled: this.config.enabled,
      channels: this.channelHealth(),
      nearExecuteThresholds: {
        biasScore: this.config.nearExecuteBiasScore,
        setupScore: this.config.nearExecuteSetupScore,
        triggerScore: this.config.nearExecuteTriggerScore,
        minRiskReward: this.config.nearExecuteMinRiskReward,
      },
      cooldownMs: this.config.cooldownMs,
    };
  }

  private requestedChannels(): Array<"telegram" | "whatsapp"> {
    const channels: Array<"telegram" | "whatsapp"> = [];
    if (this.config.telegramEnabled) channels.push("telegram");
    if (this.config.whatsappEnabled) channels.push("whatsapp");
    return channels;
  }

  private channelHealth(): NotificationChannelHealth[] {
    return [
      {
        channel: "telegram",
        enabled: this.config.telegramEnabled,
        configured:
          Boolean(this.config.telegramBotToken) &&
          Boolean(this.config.telegramChatId),
        message: this.config.telegramEnabled
          ? this.config.telegramBotToken && this.config.telegramChatId
            ? "Telegram Bot API channel is configured."
            : "Telegram is enabled but token/chat ID is incomplete."
          : "Telegram channel is disabled.",
      },
      {
        channel: "whatsapp",
        enabled: this.config.whatsappEnabled,
        configured:
          Boolean(this.config.whatsappAccessToken) &&
          Boolean(this.config.whatsappPhoneNumberId) &&
          Boolean(this.config.whatsappRecipient) &&
          Boolean(this.config.whatsappGraphApiVersion),
        message: this.config.whatsappEnabled
          ? this.config.whatsappAccessToken &&
            this.config.whatsappPhoneNumberId &&
            this.config.whatsappRecipient &&
            this.config.whatsappGraphApiVersion
            ? "WhatsApp Cloud API channel is configured."
            : "WhatsApp is enabled but Cloud API settings are incomplete."
          : "WhatsApp channel is disabled.",
      },
    ];
  }
}
