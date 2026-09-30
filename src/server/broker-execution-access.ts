import "server-only";

import { timingSafeEqual } from "node:crypto";
import { BROKER_EXECUTION_CONFIG } from "@/config/broker";
import { STORAGE_PATHS } from "@/config/storage";
import {
  JsonFileBrokerExecutionStore,
  TransactionalBrokerExecutionStore,
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
          return grant
            ? { fencingToken: grant.fencingToken }
            : null;
        },
        async release(grant) {
          // Re-read the active lease before release because the execution
          // service deliberately exposes only the fencing token.
          const current = await transactionalStore().acquireLease(
            "broker-live-execution",
            runtimeInstanceId(),
            BROKER_EXECUTION_CONFIG.liveLeaseMs
          );
          if (
            current &&
            current.fencingToken === grant.fencingToken
          ) {
            await transactionalStore().releaseLease(current);
          }
        },
      }
    : undefined,
});

export async function readBrokerExecutionDashboard(): Promise<BrokerExecutionDashboard> {
  return service.dashboard();
}

export async function processBrokerSnapshot(
  snapshot: ScannerSnapshot,
  release: ReleaseRuntimeState
): Promise<void> {
  await service.processSnapshot(snapshot, release);
}

export async function setBrokerKillSwitch(input: {
  engaged: boolean;
  changedBy: string;
  reason: string;
}): Promise<BrokerExecutionStoreState> {
  const state = await service.setKillSwitch(input);
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
  const arm = await service.armLive(input);
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
  await service.disarmLive(input);
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
  return service.reconcileUnresolved();
}

export function assertBrokerApprovalSecret(
  provided: string | null
): void {
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
