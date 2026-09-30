import { describe, expect, it } from "vitest";
import { TransactionalDocumentRepository } from "@/transactional/document-repository";
import { MemoryTransactionalStateStore } from "@/transactional/memory-store";
import { TransactionConflictError } from "@/transactional/types";

describe("Phase 9 transactional state primitives", () => {
  it("uses revision compare-and-swap to reject stale writers", async () => {
    const store = new MemoryTransactionalStateStore();
    const first = await store.compareAndSwap("state/a", null, { value: 1 });
    expect(first.revision).toBe(1);

    await expect(
      store.compareAndSwap("state/a", null, { value: 2 })
    ).rejects.toBeInstanceOf(TransactionConflictError);

    const second = await store.compareAndSwap(
      "state/a",
      first.revision,
      { value: 2 }
    );
    expect(second.revision).toBe(2);
  });

  it("retries repository mutations after a competing update", async () => {
    const store = new MemoryTransactionalStateStore();
    const repository = new TransactionalDocumentRepository(
      store,
      "counter",
      (value: { count: number }) => {
        if (!Number.isInteger(value.count)) {
          throw new Error("invalid counter");
        }
      }
    );

    await repository.replace({ count: 0 });
    await Promise.all([
      repository.update((current) => ({
        next: { count: (current?.count ?? 0) + 1 },
        result: null,
      })),
      repository.update((current) => ({
        next: { count: (current?.count ?? 0) + 1 },
        result: null,
      })),
    ]);

    expect(await repository.readValue()).toEqual({ count: 2 });
  });

  it("uses fencing tokens so an expired lease cannot release a newer lease", async () => {
    const store = new MemoryTransactionalStateStore();
    const first = await store.acquireLease("scanner", "node-a", 1);
    expect(first).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await store.acquireLease("scanner", "node-b", 1000);
    expect(second).not.toBeNull();
    expect(second!.fencingToken).toBeGreaterThan(first!.fencingToken);

    expect(await store.releaseLease(first!)).toBe(false);
    expect(await store.releaseLease(second!)).toBe(true);
  });

  it("supports durable job ownership and fenced completion", async () => {
    const store = new MemoryTransactionalStateStore();
    await store.enqueueJob({
      id: "job-1",
      queue: "validation",
      kind: "backtest",
      payload: { report: "a" },
      availableAt: 0,
      maxAttempts: 3,
    });

    const claimed = await store.claimJob<{ report: string }>(
      "validation",
      "worker-a",
      1000
    );
    expect(claimed?.status).toBe("RUNNING");
    expect(claimed?.attempts).toBe(1);

    expect(
      await store.completeJob(
        "job-1",
        "worker-b",
        claimed!.fencingToken!
      )
    ).toBe(false);
    expect(
      await store.completeJob(
        "job-1",
        "worker-a",
        claimed!.fencingToken!
      )
    ).toBe(true);
  });
});
