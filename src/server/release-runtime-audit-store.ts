import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ReleaseRuntimeAuditEvent,
  ReleaseRuntimeAuditLog,
  ReleaseRuntimeState,
} from "@/runtime/release-runtime-types";

const DEFAULT_FILE = path.join(
  process.cwd(),
  ".data",
  "release-runtime-audit.json"
);

export class JsonFileReleaseRuntimeAuditStore {
  constructor(
    private readonly filePath: string = DEFAULT_FILE,
    private readonly maxEvents = 200
  ) {}

  async read(): Promise<ReleaseRuntimeAuditLog> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as ReleaseRuntimeAuditLog;
      if (
        parsed.schemaVersion !== 1 ||
        parsed.protocol !== "phase-6-runtime-v1" ||
        !Array.isArray(parsed.events)
      ) {
        throw new Error("Invalid release runtime audit format.");
      }
      return parsed;
    } catch (error) {
      if (isNotFound(error)) {
        return {
          schemaVersion: 1,
          protocol: "phase-6-runtime-v1",
          events: [],
        };
      }
      throw error;
    }
  }

  async recordState(state: ReleaseRuntimeState): Promise<void> {
    const log = await this.read();
    const event = toEvent(state);
    const previous = log.events[log.events.length - 1];

    if (previous && sameEvent(previous, event)) return;

    const next: ReleaseRuntimeAuditLog = {
      schemaVersion: 1,
      protocol: "phase-6-runtime-v1",
      events: [...log.events, event].slice(-this.maxEvents),
    };

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(tmp, this.filePath);
  }
}

function toEvent(state: ReleaseRuntimeState): ReleaseRuntimeAuditEvent {
  return {
    at: state.resolvedAt,
    status: state.status,
    reason: state.reason,
    version: state.version,
    manifestFingerprint: state.manifestFingerprint,
    activationAt: state.activationAt,
    defaultDrift: state.defaultDrift,
    driftAreas: [...state.driftAreas],
    message: state.message,
  };
}

function sameEvent(
  left: ReleaseRuntimeAuditEvent,
  right: ReleaseRuntimeAuditEvent
): boolean {
  return (
    left.status === right.status &&
    left.reason === right.reason &&
    left.version === right.version &&
    left.manifestFingerprint === right.manifestFingerprint &&
    left.activationAt === right.activationAt &&
    left.defaultDrift === right.defaultDrift &&
    left.driftAreas.join("|") === right.driftAreas.join("|") &&
    left.message === right.message
  );
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
