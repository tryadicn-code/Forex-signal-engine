import "server-only";

import { JsonFileStrategyVersionStore } from "@/server/strategy-version-store";
import { JsonFileReleaseRuntimeAuditStore } from "@/server/release-runtime-audit-store";
import {
  blockedReleaseRuntime,
  resolveReleaseRuntimeFromRegistry,
} from "@/runtime/release-runtime";
import type {
  ReleaseRuntimeAuditLog,
  ReleaseRuntimeResolution,
} from "@/runtime/release-runtime-types";

const registry = new JsonFileStrategyVersionStore();
const audit = new JsonFileReleaseRuntimeAuditStore();

export async function resolveRuntimeRelease(): Promise<ReleaseRuntimeResolution> {
  let resolution: ReleaseRuntimeResolution;
  try {
    const state = await registry.read();
    resolution = resolveReleaseRuntimeFromRegistry(state);
  } catch (error) {
    resolution = blockedReleaseRuntime(
      "REGISTRY_INVALID",
      "Strategy version registry could not be verified: " +
        (error instanceof Error ? error.message : String(error))
    );
  }

  try {
    await audit.recordState(resolution.state);
  } catch {
    // Audit persistence must never turn a valid pinned release into an
    // unhandled server exception. Runtime state remains authoritative.
  }

  return resolution;
}

export async function readReleaseRuntimeAudit(): Promise<ReleaseRuntimeAuditLog> {
  return audit.read();
}

export function releaseRuntimeIdentity(
  resolution: ReleaseRuntimeResolution
): string {
  const state = resolution.state;
  return [
    state.status,
    state.reason,
    state.version ?? "none",
    state.manifestFingerprint ?? "none",
  ].join(":");
}
