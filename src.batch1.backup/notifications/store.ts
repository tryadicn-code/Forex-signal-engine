import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";
import { TransactionalDocumentRepository } from "@/transactional/document-repository";
import type { TransactionalStateStore } from "@/transactional/types";
import type { NotificationStoreState } from "@/notifications/types";

export interface NotificationStore {
  read(): Promise<NotificationStoreState>;
  update<T>(
    mutate: (
      state: NotificationStoreState
    ) =>
      | Promise<{ next: NotificationStoreState; result: T }>
      | { next: NotificationStoreState; result: T }
  ): Promise<T>;
}

export class JsonFileNotificationStore
  implements NotificationStore
{
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async read(): Promise<NotificationStoreState> {
    const result = await readDurableJson(
      this.path,
      validateNotificationState
    );
    return result.value ?? initialNotificationState();
  }

  async update<T>(
    mutate: (
      state: NotificationStoreState
    ) =>
      | Promise<{ next: NotificationStoreState; result: T }>
      | { next: NotificationStoreState; result: T }
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
      const mutation = await mutate(structuredClone(current));
      validateNotificationState(mutation.next);
      await writeDurableJson(this.path, mutation.next);
      return mutation.result;
    } finally {
      release();
    }
  }
}

export class TransactionalNotificationStore
  implements NotificationStore
{
  private readonly repo: TransactionalDocumentRepository<NotificationStoreState>;

  constructor(store: TransactionalStateStore) {
    this.repo = new TransactionalDocumentRepository(
      store,
      "state/notifications",
      validateNotificationState
    );
  }

  async read(): Promise<NotificationStoreState> {
    return (await this.repo.readValue()) ?? initialNotificationState();
  }

  async update<T>(
    mutate: (
      state: NotificationStoreState
    ) =>
      | Promise<{ next: NotificationStoreState; result: T }>
      | { next: NotificationStoreState; result: T }
  ): Promise<T> {
    return this.repo.update(async (current) =>
      mutate(structuredClone(current ?? initialNotificationState()))
    );
  }
}

export function initialNotificationState(): NotificationStoreState {
  return {
    schemaVersion: 1,
    protocol: "phase-11-alerts-v1",
    events: [],
    deliveries: [],
  };
}

function validateNotificationState(
  state: NotificationStoreState
): void {
  if (
    state.schemaVersion !== 1 ||
    state.protocol !== "phase-11-alerts-v1" ||
    !Array.isArray(state.events) ||
    !Array.isArray(state.deliveries)
  ) {
    throw new Error("Invalid Phase 11 notification state.");
  }
}
