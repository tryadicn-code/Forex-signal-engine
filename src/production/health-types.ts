import type { DurableFileHealth } from "@/persistence/types";
import type { ProviderStatus } from "@/types/market-data";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { StartupRecoveryReport } from "@/production/startup-recovery-types";

export type ProductionReadiness = "READY" | "DEGRADED" | "BLOCKED";

export interface ProductionHealthCheck {
  id: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
}

export interface ProductionHealthSnapshot {
  schemaVersion: 1;
  protocol: "phase-8-health-v1";
  generatedAt: number;
  uptimeSeconds: number;
  readiness: ProductionReadiness;
  executionMode: "PAPER";
  providerId: string;
  liveMarketData: boolean;
  provider: ProviderStatus;
  releaseRuntime: ReleaseRuntimeState;
  startupRecovery: StartupRecoveryReport;
  persistence: DurableFileHealth[];
  checks: ProductionHealthCheck[];
}
