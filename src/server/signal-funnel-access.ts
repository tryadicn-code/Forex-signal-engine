import "server-only";

import { STORAGE_PATHS } from "@/config/storage";
import {
  buildSignalFunnelDashboard,
  type DownstreamOrderInput,
  type DownstreamTradeInput,
  type SignalFunnelDashboard,
} from "@/analytics/signal-funnel";
import { readPaperDashboard } from "@/server/paper-trading-access";
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

/**
 * H8C-2: this function throws on persistence failure on purpose. Callers
 * must treat signal-funnel analytics as observability, not as part of the
 * trading critical path: the scanner persists observations from a detached
 * promise and catches the error there (see scanner-access.ts
 * persistSignalFunnelSafely). Do not call this from a synchronous scanner
 * step without wrapping it.
 */
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

/**
 * Wipe the durable signal funnel store. Used by the manual reset control on
 * the dashboard. Returns the (now empty) store state.
 *
 * The in-memory analytics repository owned by the scanner service is not
 * touched here; it lives only for the process lifetime and does not affect
 * the dashboard view, which always reads from the durable store.
 */
export async function resetSignalFunnelStore(): Promise<void> {
  await store.clear();
  setPersistenceError(null);
}

export async function readSignalFunnelDashboard(
  asOf = Date.now()
): Promise<SignalFunnelDashboardView> {
  try {
    const state = await store.read();

    // TRD-017 Change B / TRD-RR-003: read the paper store at the same time so
    // downstream outcomes and per-strategy win rates appear next to the
    // funnel stages. This is a read-time join and never mutates the funnel
    // schema.
    const [downstream, trades] = await Promise.all([
      readDownstreamOrdersSafely(),
      readDownstreamTradesSafely(),
    ]);

    return {
      analytics: buildSignalFunnelDashboard(
        state.observations,
        asOf,
        downstream,
        trades
      ),
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

/**
 * Read the paper store and project only the fields the funnel needs.
 *
 * A failure here must not take down the funnel view: downstream visibility is
 * a nice-to-have, the funnel is the primary artifact. On any error we return
 * an empty array and let the panel render zero counters.
 */
async function readDownstreamOrdersSafely(): Promise<DownstreamOrderInput[]> {
  try {
    const paper = await readPaperDashboard();
    return paper.recentOrders.map((order) => ({
      requestedAt: order.requestedAt,
      status: order.status,
      rejectionReason: order.rejectionReason,
    }));
  } catch {
    return [];
  }
}

/**
 * Read closed paper trades and project only what the per-strategy breakdown
 * needs. Same failure policy as the orders reader: on error return an empty
 * array so the funnel view still renders.
 */
async function readDownstreamTradesSafely(): Promise<DownstreamTradeInput[]> {
  try {
    const paper = await readPaperDashboard();
    return paper.recentTrades.map((trade) => ({
      closedAt: trade.closedAt,
      engine: { strategyId: trade.engine.strategyId ?? null },
      realizedPnL: trade.realizedPnL,
      realizedR: trade.realizedR,
    }));
  } catch {
    return [];
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
