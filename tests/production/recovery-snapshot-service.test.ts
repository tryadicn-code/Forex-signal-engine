import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RecoverySnapshotService } from "@/production/recovery-snapshot-service";

const dirs: string[] = [];

async function fixture(maxSnapshots = 10) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-recovery-"));
  dirs.push(dir);
  const data = path.join(dir, "data");
  const snapshots = path.join(data, "snapshots");
  await fs.mkdir(data, { recursive: true });

  const sources = {
    paper: path.join(data, "paper-trading.json"),
    strategyRegistry: path.join(data, "strategy-version-registry.json"),
    releaseRuntimeAudit: path.join(data, "release-runtime-audit.json"),
    forwardValidation: path.join(data, "forward-validation.json"),
  };

  await fs.writeFile(
    sources.paper,
    JSON.stringify({ schemaVersion: 1, account: { balance: 10000 } }),
    "utf8"
  );
  await fs.writeFile(
    sources.strategyRegistry,
    JSON.stringify({ schemaVersion: 1, protocol: "phase-5.9-v1", entries: [] }),
    "utf8"
  );

  return {
    service: new RecoverySnapshotService(
      sources,
      snapshots,
      maxSnapshots
    ),
    snapshots,
  };
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true })
    )
  );
});

describe("Phase 8 recovery snapshots", () => {
  it("requires maintenance mode before capturing operational state", async () => {
    const { service } = await fixture();

    await expect(
      service.create({
        createdBy: "operator",
        reason: "pre-deploy snapshot",
        maintenanceMode: false,
        now: 1000,
      })
    ).rejects.toThrow(/maintenance mode/i);
  });

  it("captures present and missing sources and verifies checksums", async () => {
    const { service } = await fixture();

    const snapshot = await service.create({
      createdBy: "operator",
      reason: "pre-deploy snapshot",
      maintenanceMode: true,
      now: 1000,
    });

    expect(snapshot.id).toBe("snapshot-1000");
    expect(
      snapshot.files.find((file) => file.key === "paper")?.present
    ).toBe(true);
    expect(
      snapshot.files.find((file) => file.key === "forwardValidation")
        ?.present
    ).toBe(false);

    const verification = await service.verify(snapshot.id);
    expect(verification.valid).toBe(true);
    expect(verification.files.every((file) => file.valid)).toBe(true);
  });

  it("detects tampering in a recovery snapshot copy", async () => {
    const { service, snapshots } = await fixture();
    const snapshot = await service.create({
      createdBy: "operator",
      reason: "before maintenance",
      maintenanceMode: true,
      now: 2000,
    });

    await fs.writeFile(
      path.join(snapshots, snapshot.id, "paper.json"),
      JSON.stringify({ tampered: true }),
      "utf8"
    );

    const verification = await service.verify(snapshot.id);
    expect(verification.valid).toBe(false);
    expect(
      verification.files.find((file) => file.key === "paper")?.valid
    ).toBe(false);
  });

  it("prunes snapshots beyond the configured retention", async () => {
    const { service } = await fixture(2);

    for (const now of [1000, 2000, 3000]) {
      await service.create({
        createdBy: "operator",
        reason: "rotation test",
        maintenanceMode: true,
        now,
      });
    }

    const snapshots = await service.list();
    expect(snapshots.map((item) => item.id)).toEqual([
      "snapshot-3000",
      "snapshot-2000",
    ]);
  });
});
