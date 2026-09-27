/**
 * In-memory repository implementations.
 *
 * The default Phase 2 storage: no database, no files, no network. Every store is
 * a plain Map guarded by the contracts in {@link ./types}. These are sufficient
 * for the scanner service, the API layer and the tests; a deployment that needs
 * persistence implements the same interfaces against real storage.
 */

import type { ProviderStatus, SignalStateTransition } from "@/types/market-data";
import type { SignalLifecycleState } from "@/scanner/signal-lifecycle";
import type { ScannerHealth, ScannerSnapshot } from "@/scanner/scanner-result";
import type {
  HealthRepository,
  SignalRepository,
  SnapshotRepository,
  TransitionHistoryRepository,
} from "./types";

export class InMemorySignalRepository implements SignalRepository {
  private readonly store = new Map<string, SignalLifecycleState>();

  getById(signalId: string): SignalLifecycleState | null {
    return this.store.get(signalId) ?? null;
  }

  getBySymbol(symbol: string): SignalLifecycleState[] {
    return this.getAll().filter((s) => s.identity.symbol === symbol);
  }

  getAll(): SignalLifecycleState[] {
    return [...this.store.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  upsert(lifecycle: SignalLifecycleState): SignalLifecycleState {
    this.store.set(lifecycle.identity.signalId, lifecycle);
    return lifecycle;
  }

  delete(signalId: string): boolean {
    return this.store.delete(signalId);
  }

  count(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

export class InMemoryTransitionHistoryRepository
  implements TransitionHistoryRepository
{
  private readonly history: SignalStateTransition[] = [];

  append(transition: SignalStateTransition): SignalStateTransition {
    this.history.push(transition);
    return transition;
  }

  getBySignal(signalId: string): SignalStateTransition[] {
    return this.history.filter((t) => t.signalId === signalId);
  }

  getRecent(limit: number): SignalStateTransition[] {
    return this.history.slice(Math.max(0, this.history.length - limit)).reverse();
  }

  count(): number {
    return this.history.length;
  }

  clear(): void {
    this.history.length = 0;
  }
}

export class InMemorySnapshotRepository implements SnapshotRepository {
  private latest: ScannerSnapshot | null = null;

  getLatest(): ScannerSnapshot | null {
    return this.latest;
  }

  save(snapshot: ScannerSnapshot): ScannerSnapshot {
    this.latest = snapshot;
    return snapshot;
  }

  clear(): void {
    this.latest = null;
  }
}

export class InMemoryHealthRepository implements HealthRepository {
  private health: ScannerHealth | null = null;
  private providerStatus: ProviderStatus | null = null;

  get(): ScannerHealth | null {
    return this.health;
  }

  save(health: ScannerHealth): ScannerHealth {
    this.health = health;
    return health;
  }

  getProviderStatus(): ProviderStatus | null {
    return this.providerStatus;
  }

  saveProviderStatus(status: ProviderStatus): ProviderStatus {
    this.providerStatus = status;
    return status;
  }

  clear(): void {
    this.health = null;
    this.providerStatus = null;
  }
}

/**
 * One object holding every Phase 2 repository, so the scanner service and the
 * API layer receive a single dependency instead of four.
 */
export interface RepositoryBundle {
  signals: SignalRepository;
  transitions: TransitionHistoryRepository;
  snapshots: SnapshotRepository;
  health: HealthRepository;
}

export function createInMemoryRepositories(): RepositoryBundle {
  return {
    signals: new InMemorySignalRepository(),
    transitions: new InMemoryTransitionHistoryRepository(),
    snapshots: new InMemorySnapshotRepository(),
    health: new InMemoryHealthRepository(),
  };
}
