import {
  TransactionConflictError,
  type TransactionalDocument,
  type TransactionalStateStore,
} from "@/transactional/types";

export interface MutationResult<T, R> {
  next: T;
  result: R;
}

export class TransactionalDocumentRepository<T> {
  constructor(
    private readonly store: TransactionalStateStore,
    private readonly key: string,
    private readonly validate: (value: T) => void
  ) {}

  async readDocument(): Promise<TransactionalDocument<T> | null> {
    const document = await this.store.read<T>(this.key);
    if (document) this.validate(document.value);
    return document;
  }

  async readValue(): Promise<T | null> {
    const document = await this.readDocument();
    return document ? structuredClone(document.value) : null;
  }

  async replace(value: T): Promise<T> {
    this.validate(value);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await this.readDocument();
      try {
        const saved = await this.store.compareAndSwap(
          this.key,
          current?.revision ?? null,
          structuredClone(value)
        );
        this.validate(saved.value);
        return structuredClone(saved.value);
      } catch (error) {
        if (!(error instanceof TransactionConflictError) || attempt === 4) {
          throw error;
        }
      }
    }
    throw new Error("Unreachable transactional replace failure.");
  }

  /**
   * M8E-E1-1: `mutate` may be invoked more than once when a CAS conflict is
   * retried. It MUST be a pure function of `current` -- no external side
   * effects, no random IDs, no timestamps read from `Date.now()` inside the
   * mutation. Every deterministic value the mutation needs should be derived
   * from `current` or from the arguments captured before `update()` is
   * called.
   */
  async update<R>(
    mutate: (
      current: T | null
    ) => Promise<MutationResult<T, R>> | MutationResult<T, R>
  ): Promise<R> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await this.readDocument();
      const mutation = await mutate(
        current ? structuredClone(current.value) : null
      );
      this.validate(mutation.next);

      try {
        await this.store.compareAndSwap(
          this.key,
          current?.revision ?? null,
          structuredClone(mutation.next)
        );
        return mutation.result;
      } catch (error) {
        if (!(error instanceof TransactionConflictError) || attempt === 4) {
          throw error;
        }
      }
    }
    throw new Error("Unreachable transactional update failure.");
  }
}
