/**
 * Repository abstractions (Section 21 spec).
 *
 * The scanner produces state; repositories persist it. The interfaces here are
 * the boundary between the scanning domain and whatever storage a deployment
 * uses (in-memory now, a database or file later). The scanner depends on these
 * interfaces, never on a concrete storage technology, so a Phase 3 deployment
 * can swap the implementation without touching the scanner.
 *
 * All persistence is keyed and explicit: lookups never silently invent a record,
 * and writes return what they stored so callers can act on the result.
 */

import type { ProviderStatus, SignalStateTransition } from "@/types/market-data";
import type { SignalLifecycleState } from "@/scanner/signal-lifecycle";
import type { ScannerSnapshot, ScannerHealth } from "@/scanner/scanner-result";
import type { SignalFunnelObservation } from "@/analytics/signal-funnel";

/**
 * Read/write store for signal lifecycles.
 *
 * A signal is keyed by its deterministic {@link SignalLifecycleState.identity}
 * signalId. Upsert semantics: the same setup re-observed in a later cycle
 * refreshes the existing record instead of creating a duplicate, which is what
 * keeps the dashboard showing continuity rather than a churn of new rows.
 */
export interface SignalRepository {
  /** The stored lifecycle, or null when no signal with that id is tracked. */
  getById(signalId: string): SignalLifecycleState | null;
  /** Every tracked lifecycle for one symbol, newest update first. */
  getBySymbol(symbol: string): SignalLifecycleState[];
  /** Every tracked lifecycle across all symbols. */
  getAll(): SignalLifecycleState[];
  /** Insert or replace a lifecycle and return the stored record. */
  upsert(lifecycle: SignalLifecycleState): SignalLifecycleState;
  /** Remove one lifecycle; true when something was actually removed. */
  delete(signalId: string): boolean;
  /** Number of lifecycles currently tracked. */
  count(): number;
  /** Remove every record (used by tests and full resets). */
  clear(): void;
}

/**
 * Append-only store for signal state transitions.
 *
 * Transition history is the audit trail: it is written once and never edited,
 * so the interface exposes append and read operations only.
 */
export interface TransitionHistoryRepository {
  /** Append one transition; returns the stored transition. */
  append(transition: SignalStateTransition): SignalStateTransition;
  /** The full history for one signal, oldest first. */
  getBySignal(signalId: string): SignalStateTransition[];
  /** Recent transitions across all signals, newest first. */
  getRecent(limit: number): SignalStateTransition[];
  /** Total transitions recorded. */
  count(): number;
  clear(): void;
}

/**
 * Store for completed scan snapshots, so the API can serve the last result
 * without re-running the scan.
 */
export interface SnapshotRepository {
  /** The most recent completed snapshot, or null before the first scan. */
  getLatest(): ScannerSnapshot | null;
  /** Persist a completed snapshot and return it. */
  save(snapshot: ScannerSnapshot): ScannerSnapshot;
  clear(): void;
}

/** Operational health of the scan cycle and its data provider. */
export interface HealthRepository {
  /** Last known scanner health, or null before the first scan. */
  get(): ScannerHealth | null;
  save(health: ScannerHealth): ScannerHealth;
  /** Last known provider status, or null when the provider never reported. */
  getProviderStatus(): ProviderStatus | null;
  saveProviderStatus(status: ProviderStatus): ProviderStatus;
  clear(): void;
}


/**
 * Append-only observation store for Signal Funnel + Rejection Analytics.
 *
 * The analytics layer is observational only: it never feeds decisions back
 * into the strategy pipeline.
 */
export interface SignalFunnelAnalyticsRepository {
  append(observation: SignalFunnelObservation): SignalFunnelObservation;
  appendMany(observations: SignalFunnelObservation[]): number;
  getSince(since: number, until?: number): SignalFunnelObservation[];
  count(): number;
  pruneBefore(cutoff: number): number;
  clear(): void;
}
