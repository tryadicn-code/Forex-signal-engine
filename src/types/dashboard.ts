import type { SignalView } from "@/scanner/scanner-api";
import type { ScannerHealth, ScannerSnapshot } from "@/scanner/scanner-result";
import type { SignalStateTransition } from "@/types/market-data";
import type { PaperDashboardData } from "@/paper/types";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { NotificationDashboard } from "@/notifications/types";
import type { SignalFunnelDashboard } from "@/analytics/signal-funnel";

/**
 * Serializable application-facing payload for the dashboard.
 */
export type DownstreamStageStatus =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: "skipped"; because: string };

export interface DownstreamStatus {
  forwardValidation: DownstreamStageStatus;
  paper: DownstreamStageStatus;
  notification: DownstreamStageStatus;
  broker: DownstreamStageStatus;
}

export interface DashboardData {
  snapshot: ScannerSnapshot | null;
  health: ScannerHealth | null;
  activeSignals: SignalView[];
  allSignals: SignalView[];
  recentTransitions: SignalStateTransition[];
  signalHistory: Record<string, SignalStateTransition[]>;
  scanError: string | null;
  /** Phase 12.2 downstream pipeline stage outcome. */
  downstreamStatus?: DownstreamStatus;  /** Runtime market-data provider id. Optional for test fixtures/backward compatibility. */
  providerId?: string;
  /** True only when the runtime provider is not the deterministic mock. */
  liveMarketData?: boolean;
  /** Phase 4 paper-account state. Optional for older fixtures. */
  paper?: PaperDashboardData;
  /** Phase 6 strategy release runtime state. */
  releaseRuntime?: ReleaseRuntimeState;
  /** Phase 11 realtime alerting state. */
  notifications?: NotificationDashboard;
  /** Rolling Signal Funnel + Rejection Analytics. */
  signalFunnel?: SignalFunnelDashboard | null;
  /** Non-authoritative persistence warning for funnel analytics. */
  signalFunnelError?: string | null;
  /** Runtime automation status. Optional for older fixtures/backward compatibility. */
  automation?: {
    enabled: boolean;
    scanIntervalMs: number;
    dashboardSyncIntervalMs: number;
    /** Server runtime target for the next automatic scan. */
    nextScanAt: number | null;
  };
}
