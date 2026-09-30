import type { PaperStoreState } from "@/paper/types";
import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";

export interface PaperStore {
  load(): Promise<PaperStoreState | null>;
  save(state: PaperStoreState): Promise<void>;
}

function cloneState(state: PaperStoreState): PaperStoreState {
  return structuredClone(state);
}

export class InMemoryPaperStore implements PaperStore {
  private state: PaperStoreState | null = null;

  async load(): Promise<PaperStoreState | null> {
    return this.state === null ? null : cloneState(this.state);
  }

  async save(state: PaperStoreState): Promise<void> {
    this.state = cloneState(state);
  }
}

export class JsonFilePaperStore implements PaperStore {
  constructor(private readonly path: string) {}

  async load(): Promise<PaperStoreState | null> {
    const result = await readDurableJson(
      this.path,
      validatePaperStoreState
    );
    return result.value;
  }

  async save(state: PaperStoreState): Promise<void> {
    validatePaperStoreState(state);
    await writeDurableJson(this.path, state);
  }
}

function validatePaperStoreState(state: PaperStoreState): void {
  if (
    state.schemaVersion !== 1 ||
    !state.account ||
    !Array.isArray(state.orders) ||
    !Array.isArray(state.positions) ||
    !Array.isArray(state.trades) ||
    !Array.isArray(state.ledger)
  ) {
    throw new Error("Invalid Paper Trading store schema.");
  }
}
