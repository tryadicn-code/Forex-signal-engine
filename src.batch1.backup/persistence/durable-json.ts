import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  DurableFileHealth,
  DurableReadResult,
} from "@/persistence/types";

type PersistenceHealthGlobal = typeof globalThis & {
  __fsePersistenceHealth?: Map<string, DurableFileHealth>;
};

function healthMap(): Map<string, DurableFileHealth> {
  const runtime = globalThis as PersistenceHealthGlobal;
  if (!runtime.__fsePersistenceHealth) {
    runtime.__fsePersistenceHealth = new Map();
  }
  return runtime.__fsePersistenceHealth;
}

export function readPersistenceHealth(): DurableFileHealth[] {
  return [...healthMap().values()]
    .map((item) => ({ ...item }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function inspectDurableJson(
  filePath: string
): Promise<DurableFileHealth> {
  const checkedAt = Date.now();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const normalized = raw.trimEnd();
    JSON.parse(normalized);
    const checksum = await optionalRead(checksumFilePath(filePath));
    if (checksum !== null && checksum.trim() !== sha256(normalized)) {
      throw new Error("Checksum mismatch for " + filePath + ".");
    }
    const stat = await fs.stat(filePath);
    const health: DurableFileHealth = {
      path: filePath,
      state: checksum === null ? "LEGACY_UNVERIFIED" : "VERIFIED",
      checkedAt,
      lastWriteAt: stat.mtimeMs,
      recoveredAt: null,
      message:
        checksum === null
          ? "Valid legacy JSON without checksum sidecar."
          : "Primary JSON and checksum are valid.",
    };
    recordHealth(health);
    return health;
  } catch (error) {
    if (isNotFound(error)) {
      const health: DurableFileHealth = {
        path: filePath,
        state: "MISSING",
        checkedAt,
        lastWriteAt: null,
        recoveredAt: null,
        message: "No persisted file exists yet.",
      };
      recordHealth(health);
      return health;
    }

    try {
      const backup = await fs.readFile(backupFilePath(filePath), "utf8");
      const normalizedBackup = backup.trimEnd();
      JSON.parse(normalizedBackup);
      const backupChecksum = await optionalRead(
        checksumFilePath(backupFilePath(filePath))
      );
      if (
        backupChecksum !== null &&
        backupChecksum.trim() !== sha256(normalizedBackup)
      ) {
        throw new Error("Backup checksum mismatch.");
      }
      const health: DurableFileHealth = {
        path: filePath,
        state: "RECOVERED",
        checkedAt,
        lastWriteAt: null,
        recoveredAt: null,
        message:
          "Primary is invalid but a parseable previous-good backup is available. Domain read will recover it automatically.",
      };
      recordHealth(health);
      return health;
    } catch (backupError) {
      const health: DurableFileHealth = {
        path: filePath,
        state: "CORRUPT",
        checkedAt,
        lastWriteAt: null,
        recoveredAt: null,
        message:
          "Primary and backup are invalid. Primary: " +
          errorMessage(error) +
          " Backup: " +
          errorMessage(backupError),
      };
      recordHealth(health);
      return health;
    }
  }
}

export async function readDurableJson<T>(
  filePath: string,
  validate: (value: T) => void
): Promise<DurableReadResult<T>> {
  const checkedAt = Date.now();

  try {
    const primary = await readCandidate<T>(filePath, validate);
    const state = primary.checksumPresent
      ? "VERIFIED"
      : "LEGACY_UNVERIFIED";
    const health: DurableFileHealth = {
      path: filePath,
      state,
      checkedAt,
      lastWriteAt: primary.mtimeMs,
      recoveredAt: null,
      message: primary.checksumPresent
        ? "Primary file checksum and schema are valid."
        : "Legacy primary file is valid but has no checksum sidecar yet.",
    };
    recordHealth(health);
    return { value: primary.value, health };
  } catch (primaryError) {
    if (isNotFound(primaryError)) {
      const health: DurableFileHealth = {
        path: filePath,
        state: "MISSING",
        checkedAt,
        lastWriteAt: null,
        recoveredAt: null,
        message: "No persisted file exists yet.",
      };
      recordHealth(health);
      return { value: null, health };
    }

    try {
      const backupPath = backupFilePath(filePath);
      const backup = await readCandidate<T>(backupPath, validate);
      await writeDurableJson(filePath, backup.value, {
        preserveExistingAsBackup: false,
      });
      const health: DurableFileHealth = {
        path: filePath,
        state: "RECOVERED",
        checkedAt,
        lastWriteAt: Date.now(),
        recoveredAt: Date.now(),
        message:
          "Primary file was invalid and was automatically recovered from the previous-good backup. Primary error: " +
          errorMessage(primaryError),
      };
      recordHealth(health);
      return { value: structuredClone(backup.value), health };
    } catch (backupError) {
      const health: DurableFileHealth = {
        path: filePath,
        state: "CORRUPT",
        checkedAt,
        lastWriteAt: null,
        recoveredAt: null,
        message:
          "Primary and backup could not be verified. Primary: " +
          errorMessage(primaryError) +
          " Backup: " +
          errorMessage(backupError),
      };
      recordHealth(health);
      throw new DurablePersistenceError(health.message, health);
    }
  }
}

export async function writeDurableJson<T>(
  filePath: string,
  value: T,
  options: { preserveExistingAsBackup?: boolean } = {}
): Promise<void> {
  const preserve = options.preserveExistingAsBackup ?? true;
  const directory = path.dirname(filePath);
  const payload = JSON.stringify(value, null, 2);
  const checksum = sha256(payload);

  await fs.mkdir(directory, { recursive: true });

  if (preserve) {
    await preservePreviousGood(filePath);
  }

  const nonce =
    process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  const tempPath = filePath + "." + nonce + ".tmp";
  const checksumPath = checksumFilePath(filePath);
  const tempChecksumPath = checksumPath + "." + nonce + ".tmp";

  await writeAndSync(tempPath, payload + "\n");
  await writeAndSync(tempChecksumPath, checksum + "\n");

  await fs.rename(tempPath, filePath);
  await fs.rename(tempChecksumPath, checksumPath);
  await syncDirectory(directory);

  recordHealth({
    path: filePath,
    state: "VERIFIED",
    checkedAt: Date.now(),
    lastWriteAt: Date.now(),
    recoveredAt: null,
    message: "Durable write completed with checksum verification metadata.",
  });
}

export class DurablePersistenceError extends Error {
  constructor(
    message: string,
    public readonly health: DurableFileHealth
  ) {
    super(message);
    this.name = "DurablePersistenceError";
  }
}

async function preservePreviousGood(filePath: string): Promise<void> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const existingChecksum = await optionalRead(checksumFilePath(filePath));
    if (
      existingChecksum !== null &&
      existingChecksum.trim() !== sha256(raw.trimEnd())
    ) {
      return;
    }

    const backupPath = backupFilePath(filePath);
    const backupChecksumPath = checksumFilePath(backupPath);
    await writeAndSync(backupPath + ".tmp", raw);
    await fs.rename(backupPath + ".tmp", backupPath);
    await writeAndSync(
      backupChecksumPath + ".tmp",
      sha256(raw.trimEnd()) + "\n"
    );
    await fs.rename(backupChecksumPath + ".tmp", backupChecksumPath);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

async function readCandidate<T>(
  filePath: string,
  validate: (value: T) => void
): Promise<{ value: T; checksumPresent: boolean; mtimeMs: number }> {
  const [raw, stat] = await Promise.all([
    fs.readFile(filePath, "utf8"),
    fs.stat(filePath),
  ]);
  const normalized = raw.trimEnd();
  const expected = await optionalRead(checksumFilePath(filePath));
  if (expected !== null && expected.trim() !== sha256(normalized)) {
    throw new Error("Checksum mismatch for " + filePath + ".");
  }

  let parsed: T;
  try {
    parsed = JSON.parse(normalized) as T;
  } catch (error) {
    throw new Error(
      "Invalid JSON in " + filePath + ": " + errorMessage(error)
    );
  }
  validate(parsed);

  return {
    value: parsed,
    checksumPresent: expected !== null,
    mtimeMs: stat.mtimeMs,
  };
}

async function writeAndSync(filePath: string, content: string): Promise<void> {
  const handle = await fs.open(filePath, "w");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directory: string): Promise<void> {
  try {
    const handle = await fs.open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Directory fsync is not supported on every platform/filesystem.
    // Atomic rename + file fsync remain the required baseline.
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function checksumFilePath(filePath: string): string {
  return filePath + ".sha256";
}

function backupFilePath(filePath: string): string {
  return filePath + ".bak";
}

async function optionalRead(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function recordHealth(health: DurableFileHealth): void {
  healthMap().set(health.path, { ...health });
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "ENOENT"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
