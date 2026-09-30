import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DurablePersistenceError,
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";

const dirs: string[] = [];

function validate(value: { schemaVersion: number; value: string }): void {
  if (value.schemaVersion !== 1 || typeof value.value !== "string") {
    throw new Error("invalid test schema");
  }
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) =>
      fs.rm(dir, { recursive: true, force: true })
    )
  );
});

describe("Phase 8 durable JSON persistence", () => {
  it("writes checksum metadata and verifies the primary file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-durable-"));
    dirs.push(dir);
    const file = path.join(dir, "state.json");

    await writeDurableJson(file, { schemaVersion: 1, value: "first" });
    const result = await readDurableJson(file, validate);

    expect(result.value?.value).toBe("first");
    expect(result.health.state).toBe("VERIFIED");
    expect(await fs.readFile(file + ".sha256", "utf8")).toMatch(/^[a-f0-9]{64}\n$/);
  });

  it("accepts a valid legacy JSON file without checksum", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-durable-"));
    dirs.push(dir);
    const file = path.join(dir, "legacy.json");
    await fs.writeFile(
      file,
      JSON.stringify({ schemaVersion: 1, value: "legacy" }, null, 2),
      "utf8"
    );

    const result = await readDurableJson(file, validate);

    expect(result.value?.value).toBe("legacy");
    expect(result.health.state).toBe("LEGACY_UNVERIFIED");
  });

  it("recovers a corrupted primary from the previous-good backup", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-durable-"));
    dirs.push(dir);
    const file = path.join(dir, "state.json");

    await writeDurableJson(file, { schemaVersion: 1, value: "first" });
    await writeDurableJson(file, { schemaVersion: 1, value: "second" });

    await fs.writeFile(file, "{broken", "utf8");

    const recovered = await readDurableJson(file, validate);
    expect(recovered.value?.value).toBe("first");
    expect(recovered.health.state).toBe("RECOVERED");

    const verified = await readDurableJson(file, validate);
    expect(verified.value?.value).toBe("first");
    expect(verified.health.state).toBe("VERIFIED");
  });

  it("fails explicitly when both primary and backup are invalid", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fse-durable-"));
    dirs.push(dir);
    const file = path.join(dir, "state.json");

    await fs.writeFile(file, "{broken", "utf8");
    await fs.writeFile(file + ".bak", "{also-broken", "utf8");

    await expect(readDurableJson(file, validate)).rejects.toBeInstanceOf(
      DurablePersistenceError
    );
  });
});
