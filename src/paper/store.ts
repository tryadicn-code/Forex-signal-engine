import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PaperStoreState } from "@/paper/types";

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
    try {
      const content = await readFile(this.path, "utf8");
      const parsed = JSON.parse(content) as PaperStoreState;
      if (parsed.schemaVersion !== 1) {
        throw new Error(`Unsupported paper store schema ${String(parsed.schemaVersion)}.`);
      }
      return parsed;
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : null;
      if (code === "ENOENT") return null;
      throw error;
    }
  }

  async save(state: PaperStoreState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = this.path + ".tmp";
    await writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
    await rename(temporary, this.path);
  }
}
