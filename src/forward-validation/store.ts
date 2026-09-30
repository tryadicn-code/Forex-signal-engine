import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw) as ForwardValidationStoreState;
      if (
        parsed.schemaVersion !== 1 ||
        parsed.protocol !== "phase-7-forward-v1" ||
        !Array.isArray(parsed.observations)
      ) {
        throw new Error("Invalid Phase 7 forward validation store.");
      }
      return parsed;
    } catch (error) {
      if (isNotFound(error)) {
        return {
          schemaVersion: 1,
          protocol: "phase-7-forward-v1",
          observations: [],
        };
      }
      throw error;
    }
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
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = this.path + ".tmp";
    await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
    await rename(temporary, this.path);
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
