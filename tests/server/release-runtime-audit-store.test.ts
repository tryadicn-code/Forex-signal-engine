import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonFileReleaseRuntimeAuditStore } from "@/server/release-runtime-audit-store";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";

const dirs: string[] = [];

function state(
  overrides: Partial<ReleaseRuntimeState> = {}
): ReleaseRuntimeState {
  return {
    status: "ACTIVE",
    reason: "ACTIVE_RELEASE",
    canScan: true,
    version: "v1.0.0",
    title: "baseline",
    manifestFingerprint: "abcdef1234567890",
    sourceReportId: "report-1",
    registryUpdatedAt: 1,
    resolvedAt: 100,
    pinned: true,
    defaultDrift: false,
    driftAreas: [],
    message: "ACTIVE release is pinned.",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true })
    )
  );
});

describe("Phase 6 release runtime audit store", () => {
  it("records state transitions but deduplicates repeated observations", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-runtime-audit-"));
    dirs.push(dir);
    const store = new JsonFileReleaseRuntimeAuditStore(
      path.join(dir, "audit.json")
    );

    await store.recordState(state({ resolvedAt: 100 }));
    await store.recordState(state({ resolvedAt: 200 }));

    let log = await store.read();
    expect(log.events).toHaveLength(1);

    await store.recordState(
      state({
        resolvedAt: 300,
        version: "v1.1.0",
        manifestFingerprint: "bbbbbb1234567890",
      })
    );

    log = await store.read();
    expect(log.events).toHaveLength(2);
    expect(log.events[1].version).toBe("v1.1.0");
  });

  it("preserves a bounded append-only operational history", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-runtime-audit-"));
    dirs.push(dir);
    const store = new JsonFileReleaseRuntimeAuditStore(
      path.join(dir, "audit.json"),
      2
    );

    await store.recordState(state({ version: "v1.0.0", resolvedAt: 1 }));
    await store.recordState(
      state({
        version: "v1.1.0",
        manifestFingerprint: "1111111234567890",
        resolvedAt: 2,
      })
    );
    await store.recordState(
      state({
        status: "BLOCKED",
        reason: "NO_ACTIVE_RELEASE",
        canScan: false,
        version: null,
        manifestFingerprint: null,
        pinned: false,
        message: "blocked",
        resolvedAt: 3,
      })
    );

    const log = await store.read();
    expect(log.events).toHaveLength(2);
    expect(log.events[0].version).toBe("v1.1.0");
    expect(log.events[1].status).toBe("BLOCKED");
  });
});
