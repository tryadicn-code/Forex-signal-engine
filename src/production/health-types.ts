import type { DurableFileHealth } from "@/persistence/types";
import type { ProviderStatus } from "@/types/market-data";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { StartupRecoveryReport } from "@/production/startup-recovery-types";
import type { TransactionalStoreHealth } from "@/transactional/types";

export type ProductionReadiness = "READY" | "DEGRADED" | "BLOCKED";

export interface ProductionHealthCheck {
  id: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
}

export interface ProductionHealthSnapshot {
  schemaVersion: 1;
  protocol: "phase-9-health-v1";
  generatedAt: number;
  uptimeSeconds: number;
  readiness: ProductionReadiness;
  executionMode: "PAPER";
  safety: {
    maintenanceMode: boolean;
    requireActiveRelease: boolean;
    requireLiveMarketData: boolean;
    requireSharedTransactionalStore: boolean;
  };
  infrastructure: {
    mode: "LOCAL" | "SHARED";
    instanceId: string;
    transactional: TransactionalStoreHealth | null;
  };
  providerId: string;
  liveMarketData: boolean;
  provider: ProviderStatus;
  releaseRuntime: ReleaseRuntimeState;
  startupRecovery: StartupRecoveryReport;
  persistence: DurableFileHealth[];
  checks: ProductionHealthCheck[];
}
