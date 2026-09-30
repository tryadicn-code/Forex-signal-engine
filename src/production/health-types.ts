import type { DurableFileHealth } from "@/persistence/types";
import type { ProviderStatus } from "@/types/market-data";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type { StartupRecoveryReport } from "@/production/startup-recovery-types";
import type { TransactionalStoreHealth } from "@/transactional/types";
import type { BrokerExecutionDashboard } from "@/broker/types";

export type ProductionReadiness = "READY" | "DEGRADED" | "BLOCKED";

export interface ProductionHealthCheck {
  id: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
}

export interface ProductionHealthSnapshot {
  schemaVersion: 1;
  protocol: "phase-10-health-v1";
  generatedAt: number;
  uptimeSeconds: number;
  readiness: ProductionReadiness;
  executionMode: "PAPER" | "SHADOW" | "LIVE";
  safety: {
    maintenanceMode: boolean;
    requireActiveRelease: boolean;
    requireLiveMarketData: boolean;
    requireSharedTransactionalStore: boolean;
    liveExecutionEnabled: boolean;
    liveEmergencyStop: boolean;
  };
  infrastructure: {
    mode: "LOCAL" | "SHARED";
    instanceId: string;
    transactional: TransactionalStoreHealth | null;
  };
  broker: BrokerExecutionDashboard;
  providerId: string;
  liveMarketData: boolean;
  provider: ProviderStatus;
  releaseRuntime: ReleaseRuntimeState;
  startupRecovery: StartupRecoveryReport;
  persistence: DurableFileHealth[];
  checks: ProductionHealthCheck[];
}
