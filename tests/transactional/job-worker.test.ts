import { describe, expect, it } from "vitest";
import { MemoryTransactionalStateStore } from "@/transactional/memory-store";
import { runOneDurableJob } from "@/transactional/job-worker";

describe("Phase 9 durable job worker", () => {
  it("claims and completes one durable job", async () => {
    const store = new MemoryTransactionalStateStore();
    await store.enqueueJob({
      id: "worker-job-1",
      queue: "maintenance",
      kind: "verify",
      payload: { value: 42 },
      availableAt: 0,
      maxAttempts: 2,
    });

    let seen = 0;
    const job = await runOneDurableJob<{ value: number }>(
      store,
      {
        queue: "maintenance",
        ownerId: "node-a",
        leaseMs: 1000,
        retryDelayMs: 10,
      },
      async (claimed, context) => {
        seen = claimed.payload.value;
        expect(context.fencingToken).toBeGreaterThan(0);
      }
    );

    expect(job?.id).toBe("worker-job-1");
    expect(seen).toBe(42);
    expect(
      await store.claimJob("maintenance", "node-b", 1000)
    ).toBeNull();
  });

  it("requeues a failed job while attempts remain", async () => {
    const store = new MemoryTransactionalStateStore();
    await store.enqueueJob({
      id: "worker-job-2",
      queue: "maintenance",
      kind: "verify",
      payload: {},
      availableAt: 0,
      maxAttempts: 2,
    });

    await expect(
      runOneDurableJob(
        store,
        {
          queue: "maintenance",
          ownerId: "node-a",
          leaseMs: 1000,
          retryDelayMs: 0,
        },
        async () => {
          throw new Error("boom");
        }
      )
    ).rejects.toThrow("boom");

    const retry = await store.claimJob(
      "maintenance",
      "node-b",
      1000
    );
    expect(retry?.attempts).toBe(2);
  });
});
