/**
 * Application / service API access layer (Section 22 spec).
 *
 * The single entry point the rest of the application (the dashboard, an API
 * route, a CLI) uses to talk to the scanner. Nothing outside this module imports
 * ScannerService directly, so the service internals can evolve without widening
 * the surface the UI depends on.
 *
 * The API is READ-ONLY and SIDE-EFFECT-FREE for inspection: every accessor
 * returns data or null, never throws for a missing scan, and never places an
 * order. The only mutation is `runScan`, which performs one analysis cycle.
 */

import type { DeepPartial } from "@/core/config/engine-config";
import type { ScannerConfig } from "@/config/scanner";
import type { ScannerHealth, ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";
import type { SignalLifecycleState } from "@/scanner/signal-lifecycle";
import type { SignalStateTransition, ProviderStatus } from "@/types/market-data";
import type { RepositoryBundle } from "@/repositories/in-memory";
import { ScannerService } from "@/scanner/scanner-service";
import type { ScannerDeps } from "@/scanner/scanner-service";
import {
  buildSignalFunnelDashboard,
  SIGNAL_FUNNEL_MAX_RETENTION_MS,
  type SignalFunnelDashboard,
} from "@/analytics/signal-funnel";

/** Read-only view of one signal, safe to hand to the UI. */
export interface SignalView {
  signalId: string;
  symbol: string;
  direction: import("@/types/market").Direction;
  originTimeframe: import("@/types/market").Timeframe;
  originTimestamp: number;
  state: import("@/types/market").SignalState;
  createdAt: number;
  updatedAt: number;
  setupOriginTimestamp: number | null;
  triggerOriginTimestamp: number | null;
  transitionCount: number;
}

export class ScannerApi {
  private readonly service: ScannerService;

  constructor(configOverrides?: DeepPartial<ScannerConfig>, deps?: Partial<ScannerDeps>) {
    this.service = new ScannerService(configOverrides, deps);
  }

  /** Underlying service, for callers that need the full contract. */
  get scanner(): ScannerService {
    return this.service;
  }

  get config(): ScannerConfig {
    return this.service.scannerConfig;
  }

  get repositories(): RepositoryBundle {
    return this.service.repositories;
  }

  /** Symbols that would be analysed in the next cycle. */
  listSymbols(): string[] {
    return this.service.symbols;
  }

  /** Phase 4 PAPER-only runtime balance input for the existing Risk Engine. */
  setRuntimeAccountBalance(balance: number): void {
    this.service.setRuntimeAccountBalance(balance);
  }

  /**
   * Run one scan cycle at market time `asOf`.
   *
   * `asOf` is the analysis anchor: only candles closed at or before it are used,
   * so passing an earlier `asOf` replays the past deterministically.
   */
  async runScan(asOf: number): Promise<ScannerSnapshot> {
    return this.service.scanOnce(asOf);
  }

  /** The most recent completed snapshot, or null before the first scan. */
  getLatestSnapshot(): ScannerSnapshot | null {
    return this.repositories.snapshots.getLatest();
  }

  /** Results of the last scan, oldest-not-scanned-safe order preserved. */
  getLatestResults(): SymbolScanResult[] {
    return this.getLatestSnapshot()?.results ?? [];
  }

  /** One symbol's latest result, or null when it has never been scanned. */
  getSymbolResult(symbol: string): SymbolScanResult | null {
    return this.getLatestResults().find((r) => r.symbol === symbol) ?? null;
  }

  /** Operational health of the scanner and its provider. */
  getHealth(): ScannerHealth | null {
    return this.repositories.health.get();
  }

  getProviderStatus(): ProviderStatus | null {
    return this.repositories.health.getProviderStatus();
  }

  /** Signals considered active right now (not in a terminal state). */
  getActiveSignals(): SignalView[] {
    return this.repositories.signals
      .getAll()
      .filter((s) => !isTerminal(s))
      .map(toView);
  }

  /** Every tracked signal, most recently updated first. */
  getAllSignals(): SignalView[] {
    return this.repositories.signals.getAll().map(toView);
  }

  /** Full transition history for one signal, oldest first. */
  getSignalHistory(signalId: string): SignalStateTransition[] {
    return this.repositories.transitions.getBySignal(signalId);
  }

  /** Recent transitions across all signals, newest first. */
  getRecentTransitions(limit: number): SignalStateTransition[] {
    return this.repositories.transitions.getRecent(limit);
  }

  /**
   * Signal Funnel + Rejection Analytics for the rolling 24h/7d/30d windows.
   * This is derived only from recorded observations and cannot influence the
   * strategy pipeline.
   */
  getSignalFunnelAnalytics(asOf?: number): SignalFunnelDashboard {
    const referenceTime =
      asOf ??
      this.getLatestSnapshot()?.completedAt ??
      this.getLatestSnapshot()?.startedAt ??
      Date.now();
    const observations =
      this.repositories.funnelAnalytics?.getSince(
        referenceTime - SIGNAL_FUNNEL_MAX_RETENTION_MS,
        referenceTime
      ) ?? [];
    return buildSignalFunnelDashboard(observations, referenceTime);
  }
}

function isTerminal(lifecycle: SignalLifecycleState): boolean {
  return lifecycle.state === "CLOSED" || lifecycle.state === "INVALIDATED";
}

function toView(lifecycle: SignalLifecycleState): SignalView {
  const identity = lifecycle.identity;
  return {
    signalId: identity.signalId,
    symbol: identity.symbol,
    direction: identity.direction,
    originTimeframe: identity.originTimeframe,
    originTimestamp: identity.originTimestamp,
    state: lifecycle.state,
    createdAt: lifecycle.createdAt,
    updatedAt: lifecycle.updatedAt,
    setupOriginTimestamp: lifecycle.setupOriginTimestamp,
    triggerOriginTimestamp: lifecycle.triggerOriginTimestamp,
    transitionCount: lifecycle.transitions.length,
  };
}

/**
 * Process-wide singleton for app code that has no dependency injection (API
 * routes, the dashboard). Tests should construct their own {@link ScannerApi}
 * instead of using this, so they stay isolated from each other.
 */
let singleton: ScannerApi | null = null;

export function getScannerApi(configOverrides?: DeepPartial<ScannerConfig>): ScannerApi {
  if (!singleton) {
    singleton = new ScannerApi(configOverrides);
  }
  return singleton;
}

/** Reset the singleton; intended for tests that need a clean process state. */
export function resetScannerApi(): void {
  singleton = null;
}
