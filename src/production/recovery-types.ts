export interface RecoverySnapshotFile {
  key:
    | "paper"
    | "strategyRegistry"
    | "releaseRuntimeAudit"
    | "forwardValidation"
    | "brokerExecution";
  sourceName: string;
  present: boolean;
  bytes: number;
  sha256: string | null;
  snapshotFile: string | null;
}

export interface RecoverySnapshotManifest {
  schemaVersion: 1;
  protocol: "phase-8-recovery-v1";
  id: string;
  createdAt: number;
  createdBy: string;
  reason: string;
  executionMode: "PAPER";
  files: RecoverySnapshotFile[];
}

export interface RecoverySnapshotVerification {
  id: string;
  valid: boolean;
  checkedAt: number;
  files: Array<{
    key: RecoverySnapshotFile["key"];
    valid: boolean;
    message: string;
  }>;
}
