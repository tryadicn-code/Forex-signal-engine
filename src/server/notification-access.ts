import "server-only";

import { timingSafeEqual } from "node:crypto";

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

type NotificationWorkerGlobal = typeof globalThis & {
  __fseNotificationWorker?: ReturnType<typeof setInterval>;
};

function ensureNotificationWorker(): void {
  if (!NOTIFICATION_CONFIG.enabled) return;
  const runtime = globalThis as NotificationWorkerGlobal;
  if (runtime.__fseNotificationWorker) return;

  const interval = Math.max(
    1_000,
    NOTIFICATION_CONFIG.workerIntervalMs
  );
  const timer = setInterval(() => {
    void drainNotificationDeliveries().catch(async (error) => {
      await emitRuntimeTelemetry({
        category: "notifications",
        name: "delivery-worker-failure",
        level: "WARN",
        durationMs: null,
        attributes: {
          error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : String(error).slice(0, 500),
        },
      });
    });
  }, interval);

  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
  runtime.__fseNotificationWorker = timer;
}

export async function processNotificationSnapshot(
  snapshot: ScannerSnapshot,
  release: ReleaseRuntimeState
): Promise<void> {
  if (!NOTIFICATION_CONFIG.enabled) return;
  ensureNotificationWorker();

  const created = await service.processSnapshot(snapshot, release);

  // External delivery is deliberately NOT awaited from the scanner path.
  // The durable outbox + worker owns network delivery so a slow notification
  // provider can never delay Paper or broker execution.
  await emitRuntimeTelemetry({
    category: "notifications",
    name: "scan-alerts",
    level: "INFO",
    durationMs: null,
    attributes: {
      created,
      telegram: NOTIFICATION_CONFIG.telegramEnabled,
      whatsapp: NOTIFICATION_CONFIG.whatsappEnabled,
    },
  });
}

export async function readNotificationDashboard(): Promise<NotificationDashboard> {
  ensureNotificationWorker();
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


export function assertNotificationAdminSecret(
  provided: string | null
): void {
  const expected = NOTIFICATION_CONFIG.adminSecret;
  if (!expected) {
    throw new Error("FSE_ALERT_ADMIN_SECRET is not configured.");
  }
  if (!provided) {
    throw new Error("Alert admin secret is required.");
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (
    left.length !== right.length ||
    !timingSafeEqual(left, right)
  ) {
    throw new Error("Alert admin secret is invalid.");
  }
}
