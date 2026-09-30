import "server-only";

import { PRODUCTION_CONFIG } from "@/config/production";
import { STORAGE_PATHS } from "@/config/storage";
import { RecoverySnapshotService } from "@/production/recovery-snapshot-service";
import type {
  RecoverySnapshotManifest,
  RecoverySnapshotVerification,
} from "@/production/recovery-types";

const service = new RecoverySnapshotService(
  {
    paper: STORAGE_PATHS.paper,
    strategyRegistry: STORAGE_PATHS.strategyRegistry,
    releaseRuntimeAudit: STORAGE_PATHS.releaseRuntimeAudit,
    forwardValidation: STORAGE_PATHS.forwardValidation,
    brokerExecution: STORAGE_PATHS.brokerExecution,
  },
  STORAGE_PATHS.snapshots,
  10
);

export async function createRecoverySnapshot(input: {
  createdBy: string;
  reason: string;
}): Promise<RecoverySnapshotManifest> {
  return service.create({
    ...input,
    maintenanceMode: PRODUCTION_CONFIG.maintenanceMode,
  });
}

export async function listRecoverySnapshots(): Promise<
  RecoverySnapshotManifest[]
> {
  return service.list();
}

export async function verifyRecoverySnapshot(
  id: string
): Promise<RecoverySnapshotVerification> {
  return service.verify(id);
}
