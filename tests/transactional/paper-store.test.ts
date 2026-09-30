import { describe, expect, it } from "vitest";
import { TransactionalPaperStore } from "@/transactional/domain-stores";
import { MemoryTransactionalStateStore } from "@/transactional/memory-store";
import { TransactionConflictError } from "@/transactional/types";
import type { PaperStoreState } from "@/paper/types";

function state(balance: number): PaperStoreState {
  return {
    schemaVersion: 1,
    account: {
      currency: "USD",
      initialBalance: balance,
      createdAt: 1,
    },
    orders: [],
    positions: [],
    trades: [],
    ledger: [],
  };
}

describe("Phase 9 transactional Paper store", () => {
  it("rejects a stale writer after another instance commits", async () => {
    const backend = new MemoryTransactionalStateStore();
    const nodeA = new TransactionalPaperStore(backend);
    const nodeB = new TransactionalPaperStore(backend);

    await nodeA.save(state(10_000));
    const a = await nodeA.load();
    const b = await nodeB.load();
    expect(a?.account.initialBalance).toBe(10_000);
    expect(b?.account.initialBalance).toBe(10_000);

    await nodeA.save(state(11_000));
    await expect(nodeB.save(state(9_000))).rejects.toBeInstanceOf(
      TransactionConflictError
    );

    expect((await nodeA.load())?.account.initialBalance).toBe(11_000);
  });
});
