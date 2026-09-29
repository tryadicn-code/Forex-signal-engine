import type { SignalView } from "@/scanner/scanner-api";
import type { ScannerHealth, ScannerSnapshot } from "@/scanner/scanner-result";
import type { SignalStateTransition } from "@/types/market-data";
import type { PaperDashboardData } from "@/paper/types";

/**
 * Serializable application-facing payload for the dashboard.
 */
export interface DashboardData {
  snapshot: ScannerSnapshot | null;
  health: ScannerHealth | null;
  activeSignals: SignalView[];
  allSignals: SignalView[];
  recentTransitions: SignalStateTransition[];
  signalHistory: Record<string, SignalStateTransition[]>;
  scanError: string | null;
  /** Runtime market-data provider id. Optional for test fixtures/backward compatibility. */
  providerId?: string;
  /** True only when the runtime provider is not the deterministic mock. */
  liveMarketData?: boolean;
  /** Phase 4 paper-account state. Optional for older fixtures. */
  paper?: PaperDashboardData;
}
