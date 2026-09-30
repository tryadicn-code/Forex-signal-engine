import "server-only";

import { PRODUCTION_CONFIG } from "@/config/production";
import { DEFAULT_FORWARD_VALIDATION_CONFIG } from "@/config/forward-validation";
import { STORAGE_PATHS } from "@/config/storage";
import { JsonFilePaperStore } from "@/paper/store";
import { JsonFileForwardValidationStore } from "@/forward-validation/store";
import { JsonFileStrategyVersionStore } from "@/server/strategy-version-store";
import { JsonFileReleaseRuntimeAuditStore } from "@/server/release-runtime-audit-store";
import { JsonFileBacktestRunStore } from "@/server/backtest-run-store";
import {
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";

export interface Phase9MigrationResult {
  protocol: "phase-9-migration-v1";
  migratedAt: number;
  createdBy: string;
  reason: string;
  seeded: string[];
  alreadyEquivalent: string[];
  skipped: string[];
}

export async function migrateLocalStateToShared(
  createdBy: string,
  reason: string
): Promise<Phase9MigrationResult> {
  if (!PRODUCTION_CONFIG.maintenanceMode) {
    throw new Error(
      "Phase 9 state migration requires FSE_MAINTENANCE_MODE=true."
    );
  }
  if (!sharedTransactionalMode()) {
    throw new Error(
      "Phase 9 state migration requires FSE_TX_STORE_MODE=remote."
    );
  }

  const actor = createdBy.trim();
  const note = reason.trim();
  if (!actor) throw new Error("createdBy is required.");
  if (!note) throw new Error("reason is required.");
  if (actor.length > 80) {
    throw new Error("createdBy must be 80 characters or fewer.");
  }
  if (note.length > 1000) {
    throw new Error("reason must be 1000 characters or fewer.");
  }

  const remote = transactionalStore();
  const seeded: string[] = [];
  const alreadyEquivalent: string[] = [];
  const skipped: string[] = [];

  const paper = await new JsonFilePaperStore(
    STORAGE_PATHS.paper
  ).load();
  if (paper) {
    await seed("state/paper", paper, remote, seeded, alreadyEquivalent);
  } else {
    skipped.push("state/paper");
  }

  const strategy = await new JsonFileStrategyVersionStore(
    STORAGE_PATHS.strategyRegistry
  ).read();
  await seed(
    "state/strategy-registry",
    strategy,
    remote,
    seeded,
    alreadyEquivalent
  );

  const audit = await new JsonFileReleaseRuntimeAuditStore(
    STORAGE_PATHS.releaseRuntimeAudit
  ).read();
  await seed(
    "state/release-runtime-audit",
    audit,
    remote,
    seeded,
    alreadyEquivalent
  );

  const forward = await new JsonFileForwardValidationStore(
    STORAGE_PATHS.forwardValidation,
    DEFAULT_FORWARD_VALIDATION_CONFIG.maxObservations
  ).read();
  await seed(
    "state/forward-validation",
    forward,
    remote,
    seeded,
    alreadyEquivalent
  );

  const localBacktests = new JsonFileBacktestRunStore(
    STORAGE_PATHS.backtestRuns
  );
  const items = await localBacktests.list(1000);
  for (const item of items) {
    const artifact = await localBacktests.read(item.id);
    if (!artifact) {
      skipped.push("backtest/" + item.id);
      continue;
    }
    await seed(
      "backtest/" + item.id,
      artifact,
      remote,
      seeded,
      alreadyEquivalent
    );
  }

  return {
    protocol: "phase-9-migration-v1",
    migratedAt: Date.now(),
    createdBy: actor,
    reason: note,
    seeded,
    alreadyEquivalent,
    skipped,
  };
}

async function seed(
  key: string,
  value: unknown,
  store: ReturnType<typeof transactionalStore>,
  seeded: string[],
  alreadyEquivalent: string[]
): Promise<void> {
  const current = await store.read<unknown>(key);
  if (current) {
    if (stableJson(current.value) === stableJson(value)) {
      alreadyEquivalent.push(key);
      return;
    }
    throw new Error(
      "Refusing to overwrite non-equivalent shared state at " + key + "."
    );
  }

  await store.compareAndSwap(key, null, value);
  seeded.push(key);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortObject(item)])
    );
  }
  return value;
}
