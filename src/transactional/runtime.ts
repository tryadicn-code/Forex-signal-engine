import "server-only";

import os from "node:os";
import { TRANSACTIONAL_CONFIG } from "@/config/transactional";
import { HttpTransactionalStateStore } from "@/transactional/http-store";
import type {
  LeaseGrant,
  TelemetryEvent,
  TransactionalStateStore,
} from "@/transactional/types";

type TransactionalRuntimeGlobal = typeof globalThis & {
  __fseTransactionalStore?: TransactionalStateStore;
  __fseInstanceId?: string;
  __fseScannerLease?: LeaseGrant | null;
};

export function sharedTransactionalMode(): boolean {
  return TRANSACTIONAL_CONFIG.mode === "remote";
}

export function runtimeInstanceId(): string {
  const runtime = globalThis as TransactionalRuntimeGlobal;
  if (!runtime.__fseInstanceId) {
    runtime.__fseInstanceId =
      TRANSACTIONAL_CONFIG.instanceId ??
      [os.hostname(), process.pid].join(":");
  }
  return runtime.__fseInstanceId;
}

export function transactionalStore(): TransactionalStateStore {
  if (!sharedTransactionalMode()) {
    throw new Error(
      "Shared transactional state is not enabled. Set FSE_TX_STORE_MODE=remote."
    );
  }

  const runtime = globalThis as TransactionalRuntimeGlobal;
  if (!runtime.__fseTransactionalStore) {
    if (!TRANSACTIONAL_CONFIG.remoteUrl) {
      throw new Error(
        "FSE_TX_STORE_URL is required when FSE_TX_STORE_MODE=remote."
      );
    }
    if (!TRANSACTIONAL_CONFIG.remoteToken) {
      throw new Error(
        "FSE_TX_STORE_TOKEN is required when FSE_TX_STORE_MODE=remote."
      );
    }
    runtime.__fseTransactionalStore = new HttpTransactionalStateStore({
      baseUrl: TRANSACTIONAL_CONFIG.remoteUrl,
      token: TRANSACTIONAL_CONFIG.remoteToken,
      timeoutMs: TRANSACTIONAL_CONFIG.requestTimeoutMs,
    });
  }
  return runtime.__fseTransactionalStore;
}

export async function acquireScannerLease(): Promise<LeaseGrant | null> {
  if (!sharedTransactionalMode()) return null;
  const runtime = globalThis as TransactionalRuntimeGlobal;
  // M8E-E1-2: clear any previous lease before attempting a new one, and on
  // failure keep it null. Without this, a failed acquire leaves the stale
  // lease visible to currentScannerLease().
  runtime.__fseScannerLease = null;
  try {
    const grant = await transactionalStore().acquireLease(
      "scanner-cycle",
      runtimeInstanceId(),
      TRANSACTIONAL_CONFIG.leaseTtlMs
    );
    runtime.__fseScannerLease = grant;
    return grant;
  } catch (error) {
    runtime.__fseScannerLease = null;
    throw error;
  }
}

export async function releaseScannerLease(
  grant: LeaseGrant | null
): Promise<void> {
  if (!grant || !sharedTransactionalMode()) return;
  try {
    await transactionalStore().releaseLease(grant);
  } finally {
    const runtime = globalThis as TransactionalRuntimeGlobal;
    if (
      runtime.__fseScannerLease?.fencingToken === grant.fencingToken
    ) {
      runtime.__fseScannerLease = null;
    }
  }
}

/**
 * M8E-E1-3: only returns a lease that has not yet expired. A stored grant
 * past its expiresAt is cleared and reported as null so callers cannot
 * accidentally rely on a dead lease.
 */
export function currentScannerLease(): LeaseGrant | null {
  const lease =
    (globalThis as TransactionalRuntimeGlobal).__fseScannerLease ?? null;
  if (!lease) return null;
  if (lease.expiresAt <= Date.now()) {
    (globalThis as TransactionalRuntimeGlobal).__fseScannerLease = null;
    return null;
  }
  return lease;
}

export async function emitRuntimeTelemetry(
  input: Omit<TelemetryEvent, "id" | "at" | "instanceId">
): Promise<void> {
  if (!sharedTransactionalMode()) return;
  const at = Date.now();
  const event: TelemetryEvent = {
    ...input,
    id:
      runtimeInstanceId().replace(/[^a-zA-Z0-9_-]/g, "-") +
      "-" +
      at +
      "-" +
      Math.random().toString(36).slice(2, 8),
    at,
    instanceId: runtimeInstanceId(),
  };
  try {
    await transactionalStore().emitTelemetry(event);
  } catch {
    // Telemetry is intentionally non-authoritative and must not change
    // scanner or governance semantics.
  }
}
