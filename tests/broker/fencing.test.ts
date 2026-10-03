import { describe, it, expect } from "vitest";
import { TransactionalBrokerExecutionStore } from "@/broker/execution-store";
import type { TransactionalStateStore } from "@/transactional/types";

function createMemoryStore(): TransactionalStateStore {
  const docs = new Map<string, { value: unknown; revision: number }>();
  let rev = 0;
  return {
    mode: "memory" as const,
    shared: false,
    async health() { return { ok: true, mode: "memory", shared: false, latencyMs: 0, message: "" }; },
    async read<T>(key: string) {
      const d = docs.get(key);
      return d ? { key, revision: d.revision, value: d.value as T, updatedAt: Date.now() } : null;
    },
    async compareAndSwap<T>(key: string, expected: number | null, value: T) {
      const c = docs.get(key);
      if ((c?.revision ?? null) !== expected) {
        const { TransactionConflictError } = await import("@/transactional/types");
        throw new TransactionConflictError(key, expected, c?.revision ?? null);
      }
      const next = ++rev;
      docs.set(key, { value, revision: next });
      return { key, revision: next, value, updatedAt: Date.now() };
    },
    async list() { return []; },
    async acquireLease() { return null; },
    async renewLease() { return null; },
    async releaseLease() { return true; },
    async enqueueJob() { throw new Error("n/a"); },
    async claimJob() { return null; },
    async completeJob() { return false; },
    async failJob() { return false; },
    async emitTelemetry() {},
    async recentTelemetry() { return []; },
  };
}

describe("fencing token validation", () => {
  it("accepts monotonic tokens", async () => {
    const store = new TransactionalBrokerExecutionStore(createMemoryStore());
    await store.update((s) => ({ next: s, result: null }), 5);
    await store.update((s) => ({ next: s, result: null }), 6);
    expect((await store.read()).lastFencingToken).toBe(6);
  });

  it("rejects stale tokens", async () => {
    const store = new TransactionalBrokerExecutionStore(createMemoryStore());
    await store.update((s) => ({ next: s, result: null }), 5);
    await expect(
      store.update((s) => ({ next: s, result: null }), 3)
    ).rejects.toThrow(/Stale fencing token/);
  });

  it("allows token-less writes (non-lease writers)", async () => {
    const store = new TransactionalBrokerExecutionStore(createMemoryStore());
    await store.update((s) => ({ next: s, result: null }), 5);
    await store.update((s) => ({ next: s, result: null }));
    expect((await store.read()).lastFencingToken).toBe(5);
  });
});