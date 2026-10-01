import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readDurableJson, writeDurableJson } from "@/persistence/durable-json";
import type {
  RecoverySnapshotFile,
  RecoverySnapshotManifest,
  RecoverySnapshotVerification,
} from "@/production/recovery-types";

export interface RecoverySourcePaths {
  paper: string;
  strategyRegistry: string;
  releaseRuntimeAudit: string;
  forwardValidation: string;
  brokerExecution?: string;
  notifications?: string;
}

export class RecoverySnapshotService {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly sources: RecoverySourcePaths,
    private readonly snapshotDirectory: string,
    private readonly maxSnapshots = 10
  ) {}

  async create(input: {
    createdBy: string;
    reason: string;
    maintenanceMode: boolean;
    now?: number;
  }): Promise<RecoverySnapshotManifest> {
    if (!input.maintenanceMode) {
      throw new Error(
        "Recovery snapshots require FSE_MAINTENANCE_MODE=true so operational state is quiescent."
      );
    }

    const createdBy = normalizeActor(input.createdBy);
    const reason = normalizeReason(input.reason);
    const now = input.now ?? Date.now();

    return this.serialize(async () => {
      await fs.mkdir(this.snapshotDirectory, { recursive: true });
      const id = "snapshot-" + now;
      const directory = path.join(this.snapshotDirectory, id);
      await fs.mkdir(directory, { recursive: false });

      const files: RecoverySnapshotFile[] = [];
      for (const [key, sourcePath] of Object.entries(this.sources) as Array<
        [RecoverySnapshotFile["key"], string]
      >) {
        files.push(
          await captureFile(key, sourcePath, directory)
        );
      }

      const manifest: RecoverySnapshotManifest = {
        schemaVersion: 1,
        protocol: "phase-8-recovery-v1",
        id,
        createdAt: now,
        createdBy,
        reason,
        executionMode: "PAPER",
        files,
      };
      await writeDurableJson(
        path.join(directory, "manifest.json"),
        manifest
      );
      await this.prune();
      return manifest;
    });
  }

  async list(): Promise<RecoverySnapshotManifest[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.snapshotDirectory);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }

    const manifests: RecoverySnapshotManifest[] = [];
    for (const entry of entries
      .filter((name) => /^snapshot-\d+$/.test(name))
      .sort()
      .reverse()) {
      const result = await readDurableJson(
        path.join(this.snapshotDirectory, entry, "manifest.json"),
        validateManifest
      ).catch(() => null);
      if (result?.value) manifests.push(result.value);
    }
    return manifests;
  }

  async verify(id: string): Promise<RecoverySnapshotVerification> {
    assertSnapshotId(id);
    const directory = path.join(this.snapshotDirectory, id);
    const result = await readDurableJson(
      path.join(directory, "manifest.json"),
      validateManifest
    );
    if (!result.value) {
      throw new Error("Recovery snapshot " + id + " was not found.");
    }

    const files = await Promise.all(
      result.value.files.map(async (entry) => {
        if (!entry.present) {
          return {
            key: entry.key,
            valid: true,
            message: "Source file was absent when snapshot was created.",
          };
        }
        if (!entry.snapshotFile || !entry.sha256) {
          return {
            key: entry.key,
            valid: false,
            message: "Snapshot manifest is missing file integrity metadata.",
          };
        }
        try {
          const raw = await fs.readFile(
            path.join(directory, entry.snapshotFile)
          );
          const actual = sha256(raw);
          return {
            key: entry.key,
            valid: actual === entry.sha256,
            message:
              actual === entry.sha256
                ? "Snapshot copy checksum is valid."
                : "Snapshot copy checksum mismatch.",
          };
        } catch (error) {
          return {
            key: entry.key,
            valid: false,
            message:
              "Snapshot copy could not be read: " +
              (error instanceof Error ? error.message : String(error)),
          };
        }
      })
    );

    return {
      id,
      valid: files.every((item) => item.valid),
      checkedAt: Date.now(),
      files,
    };
  }

  private async prune(): Promise<void> {
    const snapshots = await this.list();
    for (const item of snapshots.slice(this.maxSnapshots)) {
      await fs.rm(path.join(this.snapshotDirectory, item.id), {
        recursive: true,
        force: true,
      });
    }
  }

  private async serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

async function captureFile(
  key: RecoverySnapshotFile["key"],
  sourcePath: string,
  directory: string
): Promise<RecoverySnapshotFile> {
  try {
    const raw = await fs.readFile(sourcePath);
    JSON.parse(raw.toString("utf8"));
    const snapshotFile = key + ".json";
    const target = path.join(directory, snapshotFile);
    const handle = await fs.open(target, "wx");
    try {
      await handle.writeFile(raw);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return {
      key,
      sourceName: path.basename(sourcePath),
      present: true,
      bytes: raw.length,
      sha256: sha256(raw),
      snapshotFile,
    };
  } catch (error) {
    if (isNotFound(error)) {
      return {
        key,
        sourceName: path.basename(sourcePath),
        present: false,
        bytes: 0,
        sha256: null,
        snapshotFile: null,
      };
    }
    throw error;
  }
}

function validateManifest(value: RecoverySnapshotManifest): void {
  if (
    value.schemaVersion !== 1 ||
    value.protocol !== "phase-8-recovery-v1" ||
    !/^snapshot-\d+$/.test(value.id) ||
    !Array.isArray(value.files)
  ) {
    throw new Error("Invalid Phase 8 recovery snapshot manifest.");
  }
}

function assertSnapshotId(id: string): void {
  if (!/^snapshot-\d+$/.test(id)) {
    throw new Error("Invalid recovery snapshot id.");
  }
}

function normalizeActor(value: string): string {
  const actor = value.trim();
  if (!actor) throw new Error("Snapshot createdBy is required.");
  if (actor.length > 80) {
    throw new Error("Snapshot createdBy must be 80 characters or fewer.");
  }
  return actor;
}

function normalizeReason(value: string): string {
  const reason = value.trim();
  if (!reason) throw new Error("Snapshot reason is required.");
  if (reason.length > 500) {
    throw new Error("Snapshot reason must be 500 characters or fewer.");
  }
  return reason;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "ENOENT"
  );
}
