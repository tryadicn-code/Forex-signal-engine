import "server-only";

import { STORAGE_PATHS } from "@/config/storage";
import {
  buildSignalFunnelDashboard,
  type SignalFunnelDashboard,
} from "@/analytics/signal-funnel";
import {
  JsonFileSignalFunnelStore,
  type SignalFunnelStore,
} from "@/analytics/store";
import { TransactionalSignalFunnelStore } from "@/transactional/domain-stores";
import {
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";
import type { ScannerApi } from "@/scanner/scanner-api";
import type { ScannerSnapshot } from "@/scanner/scanner-result";

const store: SignalFunnelStore = sharedTransactionalMode()
  ? new TransactionalSignalFunnelStore(transactionalStore())
  : new JsonFileSignalFunnelStore(STORAGE_PATHS.signalFunnel);

type SignalFunnelRuntimeGlobal = typeof globalThis & {
  __fseSignalFunnelPersistenceError?: string | null;
};

export interface SignalFunnelDashboardView {
  analytics: SignalFunnelDashboard | null;
  persistenceError: string | null;
}

export async function recordSignalFunnelObservations(
  scanner: ScannerApi,
  snapshot: ScannerSnapshot
): Promise<void> {
  const observedAt = snapshot.completedAt ?? snapshot.startedAt;
  const observations = scanner.getSignalFunnelObservations(
    observedAt,
    observedAt
  );

  try {
    await store.appendMany(observations, observedAt);
    setPersistenceError(null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setPersistenceError(message);
    throw error;
  }
}

export async function readSignalFunnelDashboard(
  asOf = Date.now()
): Promise<SignalFunnelDashboardView> {
  try {
    const state = await store.read();
    return {
      analytics: buildSignalFunnelDashboard(state.observations, asOf),
      persistenceError: getPersistenceError(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setPersistenceError(message);
    return {
      analytics: null,
      persistenceError: message,
    };
  }
}

function getPersistenceError(): string | null {
  return (
    (globalThis as SignalFunnelRuntimeGlobal).__fseSignalFunnelPersistenceError ??
    null
  );
}

function setPersistenceError(error: string | null): void {
  (globalThis as SignalFunnelRuntimeGlobal).__fseSignalFunnelPersistenceError =
    error;
}
