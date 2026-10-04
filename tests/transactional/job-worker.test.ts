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


describe("Phase 9 durable job worker: failure isolation (H8E2-1)", () => {
  it("does not call failJob when the handler succeeded but completeJob fails", async () => {
    const store = new MemoryTransactionalStateStore();
    let failJobCalls = 0;
    const originalFail = store.failJob.bind(store);
    store.failJob = async (...args) => {
      failJobCalls += 1;
      return originalFail(...args);
    };

    // Force completeJob to report a fencing mismatch.
    store.completeJob = async () => false;

    await store.enqueueJob({
      id: "worker-job-3",
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
          retryDelayMs: 10,
        },
        async () => {
          // handler succeeds
        }
      )
    ).rejects.toThrow(/fencing check failed/);

    expect(failJobCalls).toBe(0);
  });

  it("still calls failJob when the handler itself throws", async () => {
    const store = new MemoryTransactionalStateStore();
    let failJobCalls = 0;
    const originalFail = store.failJob.bind(store);
    store.failJob = async (...args) => {
      failJobCalls += 1;
      return originalFail(...args);
    };

    await store.enqueueJob({
      id: "worker-job-4",
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
          retryDelayMs: 10,
        },
        async () => {
          throw new Error("handler boom");
        }
      )
    ).rejects.toThrow("handler boom");

    expect(failJobCalls).toBe(1);
  });

  it("retries with a delay that grows with the attempt count", async () => {
    const store = new MemoryTransactionalStateStore();
    // Record the scheduled delay (retryAt - now) at the moment failJob is
    // called so we compare apples to apples, not against a later clock.
    const capturedDelays: number[] = [];
    const originalFail = store.failJob.bind(store);
    store.failJob = async (id, ownerId, token, error, retryAt) => {
      capturedDelays.push(retryAt === null ? -1 : retryAt - Date.now());
      return originalFail(id, ownerId, token, error, retryAt);
    };

    await store.enqueueJob({
      id: "worker-job-5",
      queue: "maintenance",
      kind: "verify",
      payload: {},
      availableAt: 0,
      maxAttempts: 3,
    });

    const opts = {
      queue: "maintenance",
      ownerId: "node-a",
      leaseMs: 1000,
      retryDelayMs: 10,
      jitterRatio: 0,
    };

    // Attempt 1
    await expect(
      runOneDurableJob(store, opts, async () => {
        throw new Error("fail 1");
      })
    ).rejects.toThrow();

    // Wait for retryAt window.
    await new Promise((resolve) => setTimeout(resolve, 40));

    // Attempt 2
    await expect(
      runOneDurableJob(store, opts, async () => {
        throw new Error("fail 2");
      })
    ).rejects.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 60));

    // Attempt 3 -> maxAttempts reached, no retryAt.
    await expect(
      runOneDurableJob(store, opts, async () => {
        throw new Error("fail 3");
      })
    ).rejects.toThrow();

    expect(capturedDelays.length).toBe(3);
    // Attempt 1: scheduled ~10 ms ahead.
    // Attempt 2: scheduled ~20 ms ahead (exponential 2^1).
    // Attempt 3: no retry scheduled.
    expect(capturedDelays[2]).toBe(-1);
    expect(capturedDelays[0]).toBeGreaterThan(0);
    expect(capturedDelays[1]).toBeGreaterThan(capturedDelays[0]);
  });
});