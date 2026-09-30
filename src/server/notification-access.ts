import "server-only";

import { NOTIFICATION_CONFIG } from "@/config/notifications";
import { STORAGE_PATHS } from "@/config/storage";
import {
  JsonFileNotificationStore,
  TransactionalNotificationStore,
} from "@/notifications/store";
import { NotificationService } from "@/notifications/service";
import {
  TelegramNotificationAdapter,
  WhatsAppNotificationAdapter,
} from "@/notifications/adapters";
import type {
  NotificationAdapter,
  NotificationDashboard,
  NotificationStoreState,
} from "@/notifications/types";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { ScannerSnapshot } from "@/scanner/scanner-result";
import {
  emitRuntimeTelemetry,
  runtimeInstanceId,
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";

const store = sharedTransactionalMode()
  ? new TransactionalNotificationStore(transactionalStore())
  : new JsonFileNotificationStore(STORAGE_PATHS.notifications);

const adapters = new Map<string, NotificationAdapter>();

if (
  NOTIFICATION_CONFIG.telegramEnabled &&
  NOTIFICATION_CONFIG.telegramBotToken &&
  NOTIFICATION_CONFIG.telegramChatId
) {
  adapters.set(
    "telegram",
    new TelegramNotificationAdapter({
      botToken: NOTIFICATION_CONFIG.telegramBotToken,
      chatId: NOTIFICATION_CONFIG.telegramChatId,
      timeoutMs: NOTIFICATION_CONFIG.requestTimeoutMs,
    })
  );
}

if (
  NOTIFICATION_CONFIG.whatsappEnabled &&
  NOTIFICATION_CONFIG.whatsappAccessToken &&
  NOTIFICATION_CONFIG.whatsappPhoneNumberId &&
  NOTIFICATION_CONFIG.whatsappRecipient &&
  NOTIFICATION_CONFIG.whatsappGraphApiVersion
) {
  adapters.set(
    "whatsapp",
    new WhatsAppNotificationAdapter({
      accessToken: NOTIFICATION_CONFIG.whatsappAccessToken,
      phoneNumberId: NOTIFICATION_CONFIG.whatsappPhoneNumberId,
      recipient: NOTIFICATION_CONFIG.whatsappRecipient,
      graphApiVersion: NOTIFICATION_CONFIG.whatsappGraphApiVersion,
      timeoutMs: NOTIFICATION_CONFIG.requestTimeoutMs,
    })
  );
}

const service = new NotificationService(
  store,
  NOTIFICATION_CONFIG,
  adapters,
  NOTIFICATION_CONFIG.timeZone
);

export async function processNotificationSnapshot(
  snapshot: ScannerSnapshot,
  release: ReleaseRuntimeState
): Promise<void> {
  if (!NOTIFICATION_CONFIG.enabled) return;

  const created = await service.processSnapshot(snapshot, release);
  const delivered = await withDeliveryLease(async () =>
    service.drainDueDeliveries(20)
  );

  await emitRuntimeTelemetry({
    category: "notifications",
    name: "scan-alerts",
    level: "INFO",
    durationMs: null,
    attributes: {
      created,
      delivered,
      telegram: NOTIFICATION_CONFIG.telegramEnabled,
      whatsapp: NOTIFICATION_CONFIG.whatsappEnabled,
    },
  });
}

export async function readNotificationDashboard(): Promise<NotificationDashboard> {
  return service.dashboard();
}

export async function readNotificationState(): Promise<NotificationStoreState> {
  return service.readState();
}

export async function retryNotificationDeliveries(): Promise<{
  requeued: number;
  delivered: number;
}> {
  const requeued = await service.retryFailed();
  const delivered = await withDeliveryLease(async () =>
    service.drainDueDeliveries(50)
  );
  return { requeued, delivered };
}

export async function drainNotificationDeliveries(): Promise<number> {
  return withDeliveryLease(async () => service.drainDueDeliveries(50));
}

async function withDeliveryLease<T>(
  work: () => Promise<T>
): Promise<T> {
  if (!sharedTransactionalMode()) {
    return work();
  }

  const grant = await transactionalStore().acquireLease(
    "notification-delivery",
    runtimeInstanceId(),
    Math.max(
      NOTIFICATION_CONFIG.requestTimeoutMs * 4,
      60_000
    )
  );
  if (!grant) {
    return 0 as T;
  }

  try {
    return await work();
  } finally {
    await transactionalStore().releaseLease(grant);
  }
}
