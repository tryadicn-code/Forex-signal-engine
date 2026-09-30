import type { DurableFileHealth } from "@/persistence/types";
import type { ProviderStatus } from "@/types/market-data";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";

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
  persistence: DurableFileHealth[];
  checks: ProductionHealthCheck[];
}
