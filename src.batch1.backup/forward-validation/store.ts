import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";
import type {
  ForwardValidationObservation,
  ForwardValidationStoreState,
} from "@/forward-validation/types";

export class JsonFileForwardValidationStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly maxObservations: number
  ) {}

  async read(): Promise<ForwardValidationStoreState> {
    const result = await readDurableJson(
      this.path,
      validateForwardValidationState
    );
    return (
      result.value ?? {
        schemaVersion: 1,
        protocol: "phase-7-forward-v1",
        observations: [],
      }
    );
  }

  async append(
    observation: ForwardValidationObservation
  ): Promise<ForwardValidationStoreState> {
    return this.serialize(async () => {
      const state = await this.read();
      if (state.observations.some((item) => item.id === observation.id)) {
        return state;
      }

      const next: ForwardValidationStoreState = {
        schemaVersion: 1,
        protocol: "phase-7-forward-v1",
        observations: [...state.observations, structuredClone(observation)]
          .sort((a, b) => a.observedAt - b.observedAt)
          .slice(-this.maxObservations),
      };
      await this.write(next);
      return next;
    });
  }

  private async serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async write(state: ForwardValidationStoreState): Promise<void> {
    validateForwardValidationState(state);
    await writeDurableJson(this.path, state);
  }
}

function validateForwardValidationState(
  state: ForwardValidationStoreState
): void {
  if (
    state.schemaVersion !== 1 ||
    state.protocol !== "phase-7-forward-v1" ||
    !Array.isArray(state.observations)
  ) {
    throw new Error("Invalid Phase 7 forward validation store.");
  }
}
