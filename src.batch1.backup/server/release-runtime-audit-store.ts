import { STORAGE_PATHS } from "@/config/storage";
import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";
import type {
  ReleaseRuntimeAuditEvent,
  ReleaseRuntimeAuditLog,
  ReleaseRuntimeState,
} from "@/runtime/release-runtime-types";

const DEFAULT_FILE = STORAGE_PATHS.releaseRuntimeAudit;

export class JsonFileReleaseRuntimeAuditStore {
  constructor(
    private readonly filePath: string = DEFAULT_FILE,
    private readonly maxEvents = 200
  ) {}

  async read(): Promise<ReleaseRuntimeAuditLog> {
    const result = await readDurableJson(
      this.filePath,
      validateAuditLog
    );
    return (
      result.value ?? {
        schemaVersion: 1,
        protocol: "phase-6-runtime-v1",
        events: [],
      }
    );
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

    await writeDurableJson(this.filePath, next);
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

function validateAuditLog(log: ReleaseRuntimeAuditLog): void {
  if (
    log.schemaVersion !== 1 ||
    log.protocol !== "phase-6-runtime-v1" ||
    !Array.isArray(log.events)
  ) {
    throw new Error("Invalid release runtime audit format.");
  }
}
