import path from "node:path";
import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";
import {
  compareSemanticStrategyVersions,
  findActiveStrategyVersion,
  normalizeStrategyVersion,
  verifyStrategyVersionManifest,
} from "@/replay/strategy-version-registry";
import type {
  DeprecateStrategyVersionInput,
  RegisterStrategyVersionInput,
  RollbackStrategyVersionInput,
  StrategyVersionEntry,
  StrategyVersionManifest,
  StrategyVersionRegistry,
  StrategyVersionStatusEvent,
} from "@/replay/strategy-version-types";

const DEFAULT_FILE = path.join(
  process.cwd(),
  ".data",
  "strategy-version-registry.json"
);

export class JsonFileStrategyVersionStore {
  constructor(private readonly filePath: string = DEFAULT_FILE) {}

  async read(): Promise<StrategyVersionRegistry> {
    const result = await readDurableJson(
      this.filePath,
      validateRegistry
    );
    return result.value ?? emptyRegistry();
  }

  async register(
    manifest: StrategyVersionManifest,
    input: RegisterStrategyVersionInput
  ): Promise<StrategyVersionRegistry> {
    if (!verifyStrategyVersionManifest(manifest)) {
      throw new Error("Strategy manifest integrity verification failed.");
    }

    const registry = await this.read();
    const version = normalizeStrategyVersion(manifest.version);
    if (
      registry.entries.some(
        (entry) => entry.manifest.version === version
      )
    ) {
      throw new Error("Strategy version " + version + " is already registered.");
    }

    const activeVersion = findActiveStrategyVersion(registry);
    const supersedes =
      input.supersedesVersion == null || input.supersedesVersion.trim() === ""
        ? null
        : normalizeStrategyVersion(input.supersedesVersion);

    if (activeVersion !== null && supersedes !== activeVersion) {
      throw new Error(
        "An ACTIVE strategy version already exists (" +
          activeVersion +
          "). Explicitly supersede that version before registering a new ACTIVE version."
      );
    }
    if (activeVersion === null && supersedes !== null) {
      throw new Error(
        "supersedesVersion was provided but no ACTIVE strategy version exists."
      );
    }

    const now = manifest.registeredAt;
    const entries = registry.entries.map((entry) => cloneEntry(entry));

    if (activeVersion !== null) {
      const active = entries.find(
        (entry) => entry.manifest.version === activeVersion
      );
      if (!active) {
        throw new Error("ACTIVE strategy version could not be resolved.");
      }
      appendStatus(active, {
        status: "SUPERSEDED",
        changedAt: now,
        changedBy: manifest.registeredBy,
        reason: "Superseded by " + version + ".",
      });
    }

    entries.push({
      manifest: structuredClone(manifest),
      currentStatus: "ACTIVE",
      statusHistory: [
        {
          status: "ACTIVE",
          changedAt: now,
          changedBy: manifest.registeredBy,
          reason: "Registered from promoted validation report " + manifest.sourceReportId + ".",
        },
      ],
    });

    const next: StrategyVersionRegistry = {
      schemaVersion: 1,
      protocol: "phase-5.9-v1",
      updatedAt: now,
      entries: sortEntries(entries),
    };
    await this.write(next);
    return next;
  }

  async rollback(
    input: RollbackStrategyVersionInput
  ): Promise<StrategyVersionRegistry> {
    const registry = await this.read();
    const version = normalizeStrategyVersion(input.version);
    const changedBy = normalizeActor(input.changedBy);
    const reason = input.reason.trim();
    if (!reason) {
      throw new Error("Rolling back a strategy version requires a reason.");
    }
    if (reason.length > 1000) {
      throw new Error("Rollback reason must be 1000 characters or fewer.");
    }

    const entries = registry.entries.map((entry) => cloneEntry(entry));
    const target = entries.find(
      (entry) => entry.manifest.version === version
    );
    if (!target) {
      throw new Error("Strategy version " + version + " was not found.");
    }
    if (target.currentStatus === "DEPRECATED") {
      throw new Error("A DEPRECATED strategy version cannot be reactivated.");
    }
    if (target.currentStatus === "ACTIVE") {
      throw new Error("Strategy version " + version + " is already ACTIVE.");
    }
    if (target.currentStatus !== "SUPERSEDED") {
      throw new Error("Only a SUPERSEDED version can be used as a rollback target.");
    }

    const activeVersion = findActiveStrategyVersion(registry);
    const now = Date.now();

    if (activeVersion !== null) {
      const current = entries.find(
        (entry) => entry.manifest.version === activeVersion
      );
      if (!current) {
        throw new Error("ACTIVE strategy version could not be resolved.");
      }
      appendStatus(current, {
        status: "SUPERSEDED",
        changedAt: now,
        changedBy,
        reason: "Rolled back to " + version + ": " + reason,
      });
    }

    appendStatus(target, {
      status: "ACTIVE",
      changedAt: now,
      changedBy,
      reason:
        activeVersion === null
          ? "Reactivated by controlled rollback: " + reason
          : "Rollback from " + activeVersion + ": " + reason,
    });

    const next: StrategyVersionRegistry = {
      ...registry,
      updatedAt: now,
      entries: sortEntries(entries),
    };
    await this.write(next);
    return next;
  }

  async deprecate(
    input: DeprecateStrategyVersionInput
  ): Promise<StrategyVersionRegistry> {
    const registry = await this.read();
    const version = normalizeStrategyVersion(input.version);
    const changedBy = normalizeActor(input.changedBy);
    const reason = input.reason.trim();
    if (!reason) {
      throw new Error("Deprecating a strategy version requires a reason.");
    }
    if (reason.length > 1000) {
      throw new Error("Deprecation reason must be 1000 characters or fewer.");
    }

    const entries = registry.entries.map((entry) => cloneEntry(entry));
    const entry = entries.find(
      (item) => item.manifest.version === version
    );
    if (!entry) {
      throw new Error("Strategy version " + version + " was not found.");
    }
    if (entry.currentStatus === "DEPRECATED") {
      throw new Error("Strategy version " + version + " is already DEPRECATED.");
    }

    const now = Date.now();
    appendStatus(entry, {
      status: "DEPRECATED",
      changedAt: now,
      changedBy,
      reason,
    });

    const next: StrategyVersionRegistry = {
      ...registry,
      updatedAt: now,
      entries: sortEntries(entries),
    };
    await this.write(next);
    return next;
  }

  private async write(registry: StrategyVersionRegistry): Promise<void> {
    validateRegistry(registry);
    await writeDurableJson(this.filePath, registry);
  }
}

function appendStatus(
  entry: StrategyVersionEntry,
  event: StrategyVersionStatusEvent
): void {
  entry.currentStatus = event.status;
  entry.statusHistory.push({ ...event });
}

function validateRegistry(registry: StrategyVersionRegistry): void {
  if (
    registry.schemaVersion !== 1 ||
    registry.protocol !== "phase-5.9-v1" ||
    !Array.isArray(registry.entries)
  ) {
    throw new Error("Invalid strategy version registry format.");
  }

  const versions = new Set<string>();
  let activeCount = 0;
  for (const entry of registry.entries) {
    const version = normalizeStrategyVersion(entry.manifest.version);
    if (versions.has(version)) {
      throw new Error("Duplicate strategy version in registry: " + version);
    }
    versions.add(version);

    if (!verifyStrategyVersionManifest(entry.manifest)) {
      throw new Error(
        "Strategy manifest fingerprint mismatch for " + version + "."
      );
    }
    if (entry.statusHistory.length === 0) {
      throw new Error("Strategy version " + version + " has no status history.");
    }
    const lastStatus = entry.statusHistory[entry.statusHistory.length - 1].status;
    if (lastStatus !== entry.currentStatus) {
      throw new Error(
        "Strategy version " + version + " status history is inconsistent."
      );
    }
    if (entry.currentStatus === "ACTIVE") activeCount += 1;
  }
  if (activeCount > 1) {
    throw new Error("Strategy registry may contain at most one ACTIVE version.");
  }
}

function sortEntries(entries: StrategyVersionEntry[]): StrategyVersionEntry[] {
  return [...entries].sort((a, b) =>
    compareSemanticStrategyVersions(
      b.manifest.version,
      a.manifest.version
    )
  );
}

function cloneEntry(entry: StrategyVersionEntry): StrategyVersionEntry {
  return structuredClone(entry);
}

function emptyRegistry(): StrategyVersionRegistry {
  return {
    schemaVersion: 1,
    protocol: "phase-5.9-v1",
    updatedAt: 0,
    entries: [],
  };
}

function normalizeActor(value: string): string {
  const actor = value.trim();
  if (!actor) throw new Error("changedBy is required.");
  if (actor.length > 80) {
    throw new Error("changedBy must be 80 characters or fewer.");
  }
  return actor;
}
