import type { SignalView } from "@/scanner/scanner-api";
import type { ScannerHealth, ScannerSnapshot } from "@/scanner/scanner-result";
import type { SignalStateTransition } from "@/types/market-data";

/**
 * Serializable application-facing payload for the Phase 3 dashboard.
 *
 * This is a read model only. It contains scanner output and repository history;
 * it does not contain provider instances or trading logic.
 */
export interface DashboardData {
  snapshot: ScannerSnapshot | null;
  health: ScannerHealth | null;
  activeSignals: SignalView[];
  allSignals: SignalView[];
  recentTransitions: SignalStateTransition[];
  signalHistory: Record<string, SignalStateTransition[]>;
  scanError: string | null;
}
