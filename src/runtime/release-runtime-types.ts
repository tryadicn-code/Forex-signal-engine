import type { DeepPartial } from "@/core/config/engine-config";
import type { ScannerConfig } from "@/config/scanner";

export type ReleaseRuntimeStatus = "UNVERSIONED" | "ACTIVE" | "BLOCKED";

export type ReleaseRuntimeReason =
  | "REGISTRY_EMPTY"
  | "ACTIVE_RELEASE"
  | "NO_ACTIVE_RELEASE"
  | "REGISTRY_INVALID"
  | "MANIFEST_INVALID";

export interface ReleaseRuntimeState {
  status: ReleaseRuntimeStatus;
  reason: ReleaseRuntimeReason;
  canScan: boolean;
  version: string | null;
  title: string | null;
  manifestFingerprint: string | null;
  sourceReportId: string | null;
  /** Timestamp of the lifecycle event that activated this exact runtime epoch. */
  activationAt: number | null;
  registryUpdatedAt: number | null;
  resolvedAt: number;
  pinned: boolean;
  defaultDrift: boolean;
  driftAreas: string[];
  message: string;
}

export interface ReleaseRuntimeResolution {
  state: ReleaseRuntimeState;
  scannerOverrides: DeepPartial<ScannerConfig> | null;
}

export interface ReleaseRuntimeAuditEvent {
  at: number;
  status: ReleaseRuntimeStatus;
  reason: ReleaseRuntimeReason;
  version: string | null;
  manifestFingerprint: string | null;
  activationAt: number | null;
  defaultDrift: boolean;
  driftAreas: string[];
  message: string;
}

export interface ReleaseRuntimeAuditLog {
  schemaVersion: 1;
  protocol: "phase-6-runtime-v1";
  events: ReleaseRuntimeAuditEvent[];
}
