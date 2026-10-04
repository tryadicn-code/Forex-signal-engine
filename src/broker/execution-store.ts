import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";
import { TransactionalDocumentRepository } from "@/transactional/document-repository";
import type { TransactionalStateStore } from "@/transactional/types";
import type {
  BrokerExecutionStoreState,
} from "@/broker/types";

export interface BrokerExecutionStore {
  read(): Promise<BrokerExecutionStoreState>;
  /**
   * B2-H3: mutate state atomically.
   *
   * When `fencingToken` is supplied, the write is rejected if the token is
   * lower than `state.lastFencingToken`. On success, `lastFencingToken` is
   * updated to the supplied value.
   */
  update<T>(
    mutate: (
      state: BrokerExecutionStoreState
    ) => Promise<{ next: BrokerExecutionStoreState; result: T }> | {
      next: BrokerExecutionStoreState;
      result: T;
    },
    fencingToken?: number
  ): Promise<T>;
}

export class JsonFileBrokerExecutionStore
  implements BrokerExecutionStore
{
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async read(): Promise<BrokerExecutionStoreState> {
    const result = await readDurableJson(
      this.path,
      validateBrokerState
    );
    return result.value ?? initialBrokerState();
  }

  async update<T>(
    mutate: (
      state: BrokerExecutionStoreState
    ) => Promise<{ next: BrokerExecutionStoreState; result: T }> | {
      next: BrokerExecutionStoreState;
      result: T;
    },
    fencingToken?: number
  ): Promise<T> {
    const previous = this.queue;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queue = previous.catch(() => undefined).then(() => gate);
    await previous.catch(() => undefined);

    try {
      const current = await this.read();
      if (fencingToken !== undefined) {
        const last = current.lastFencingToken ?? 0;
        if (fencingToken < last) {
          throw new Error(
            "Stale fencing token: got " + fencingToken + ", last seen " + last + "."
          );
        }
      }
      const mutation = await mutate(structuredClone(current));
      if (fencingToken !== undefined) {
        mutation.next = { ...mutation.next, lastFencingToken: fencingToken };
      }
      validateBrokerState(mutation.next);
      await writeDurableJson(this.path, mutation.next);
      return mutation.result;
    } finally {
      release();
    }
  }
}

export class TransactionalBrokerExecutionStore
  implements BrokerExecutionStore
{
  private readonly repo: TransactionalDocumentRepository<BrokerExecutionStoreState>;

  constructor(store: TransactionalStateStore) {
    this.repo = new TransactionalDocumentRepository(
      store,
      "state/broker-execution",
      validateBrokerState
    );
  }

  async read(): Promise<BrokerExecutionStoreState> {
    return (await this.repo.readValue()) ?? initialBrokerState();
  }

  async update<T>(
    mutate: (
      state: BrokerExecutionStoreState
    ) => Promise<{ next: BrokerExecutionStoreState; result: T }> | {
      next: BrokerExecutionStoreState;
      result: T;
    },
    fencingToken?: number
  ): Promise<T> {
    // B2-H3: check runs INSIDE the CAS retry loop. A concurrent writer that
    // bumps lastFencingToken first makes this writer's CAS fail, re-running
    // mutate against fresh state, where the token comparison then rejects
    // the stale write.
    return this.repo.update(async (current) => {
      const state = current ?? initialBrokerState();
      if (fencingToken !== undefined) {
        const last = state.lastFencingToken ?? 0;
        if (fencingToken < last) {
          throw new Error(
            "Stale fencing token: got " + fencingToken + ", last seen " + last + "."
          );
        }
      }
      const mutation = await mutate(structuredClone(state));
      if (fencingToken !== undefined) {
        return {
          next: { ...mutation.next, lastFencingToken: fencingToken },
          result: mutation.result,
        };
      }
      return mutation;
    });
  }
}

export function initialBrokerState(
  at: number = Date.now()
): BrokerExecutionStoreState {
  return {
    schemaVersion: 1,
    protocol: "phase-10-broker-v1",
    controls: {
      killSwitchEngaged: true,
      killSwitchChangedAt: at,
      killSwitchChangedBy: "system",
      killSwitchReason:
        "Phase 10 defaults to kill-switch engaged until an operator explicitly changes it.",
      liveArm: null,
    },
    records: [],
  };
}

function validateBrokerState(
  state: BrokerExecutionStoreState
): void {
  if (
    state.schemaVersion !== 1 ||
    state.protocol !== "phase-10-broker-v1" ||
    !state.controls ||
    !Array.isArray(state.records)
  ) {
    throw new Error("Invalid Phase 10 broker execution state.");
  }
}
