import "server-only";

import { timingSafeEqual } from "node:crypto";
import { BROKER_EXECUTION_CONFIG } from "@/config/broker";
import { STORAGE_PATHS } from "@/config/storage";
import {
  JsonFileBrokerExecutionStore,
  TransactionalBrokerExecutionStore,
  type BrokerExecutionStore,
} from "@/broker/execution-store";
import { BrokerExecutionService } from "@/broker/execution-service";
import type {
  BrokerExecutionDashboard,
  BrokerExecutionStoreState,
  LiveExecutionArm,
} from "@/broker/types";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { ScannerSnapshot } from "@/scanner/scanner-result";
import { runtimeBrokerProvider } from "@/server/broker-provider";
import {
  emitRuntimeTelemetry,
  runtimeInstanceId,
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";

type BrokerSingleton = {
  store: BrokerExecutionStore;
  service: BrokerExecutionService;
};

const globalForBroker = globalThis as typeof globalThis & {
  __fseBrokerSingleton?: BrokerSingleton;
};

function createBrokerSingleton(): BrokerSingleton {
  const store = sharedTransactionalMode()
    ? new TransactionalBrokerExecutionStore(transactionalStore())
    : new JsonFileBrokerExecutionStore(STORAGE_PATHS.brokerExecution);

  const service = new BrokerExecutionService({
    store,
    provider: runtimeBrokerProvider(),
    config: BROKER_EXECUTION_CONFIG,
    sharedTransactional: sharedTransactionalMode(),
    lease: sharedTransactionalMode()
      ? {
          async acquire() {
            const grant = await transactionalStore().acquireLease(
              "broker-live-execution",
              runtimeInstanceId(),
              BROKER_EXECUTION_CONFIG.liveLeaseMs
            );
            if (!grant) return null;
            return {
              fencingToken: grant.fencingToken,
              async release() {
                await transactionalStore().releaseLease(grant);
              },
            };
          },
        }
      : undefined,
  });
  return { store, service };
}

function brokerSingleton(): BrokerSingleton {
  if (!globalForBroker.__fseBrokerSingleton) {
    globalForBroker.__fseBrokerSingleton = createBrokerSingleton();
  }
  return globalForBroker.__fseBrokerSingleton;
}

export async function readBrokerExecutionDashboard(): Promise<BrokerExecutionDashboard> {
  return brokerSingleton().service.dashboard();
}

export async function readBrokerExecutionState(): Promise<BrokerExecutionStoreState> {
  return brokerSingleton().store.read();
}

export async function processBrokerSnapshot(
  snapshot: ScannerSnapshot,
  release: ReleaseRuntimeState
): Promise<void> {
  await brokerSingleton().service.processSnapshot(snapshot, release);
}

export async function setBrokerKillSwitch(input: {
  engaged: boolean;
  changedBy: string;
  reason: string;
}): Promise<BrokerExecutionStoreState> {
  const state = await brokerSingleton().service.setKillSwitch(input);
  await emitRuntimeTelemetry({
    category: "broker",
    name: input.engaged ? "kill-switch-engaged" : "kill-switch-disengaged",
    level: input.engaged ? "WARN" : "INFO",
    durationMs: null,
    attributes: {
      actor: input.changedBy,
      reason: input.reason.slice(0, 200),
    },
  });
  return state;
}

export async function armBrokerLiveExecution(input: {
  approvedBy: string;
  reason: string;
  durationMinutes?: number;
  maxOrders?: number;
}): Promise<LiveExecutionArm> {
  const arm = await brokerSingleton().service.armLive(input);
  await emitRuntimeTelemetry({
    category: "broker",
    name: "live-armed",
    level: "WARN",
    durationMs: null,
    attributes: {
      actor: input.approvedBy,
      armId: arm.armId,
      expiresAt: arm.expiresAt,
      remainingOrders: arm.remainingOrders,
    },
  });
  return arm;
}

export async function disarmBrokerLiveExecution(input: {
  changedBy: string;
  reason: string;
}): Promise<void> {
  await brokerSingleton().service.disarmLive(input);
  await emitRuntimeTelemetry({
    category: "broker",
    name: "live-disarmed",
    level: "INFO",
    durationMs: null,
    attributes: {
      actor: input.changedBy,
      reason: input.reason.slice(0, 200),
    },
  });
}

export async function reconcileBrokerExecutions(): Promise<number> {
  return brokerSingleton().service.reconcileUnresolved();
}

export function assertBrokerApprovalSecret(
  provided: string | null
): void {
  // DEV-ONLY bypass. Mirrors the check in api-guard so routes that call this
  // function directly (e.g. broker control) also honor the dev flag.
  if ((process.env.FSE_DEV_DISABLE_AUTH ?? "").trim().toLowerCase() === "true") {
    return;
  }
  const expected = BROKER_EXECUTION_CONFIG.approvalSecret;
  if (!expected) {
    throw new Error(
      "FSE_LIVE_APPROVAL_SECRET is not configured."
    );
  }
  if (!provided) throw new Error("Approval secret is required.");

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new Error("Approval secret is invalid.");
  }
}
