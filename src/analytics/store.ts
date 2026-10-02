import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";
import {
  SIGNAL_FUNNEL_MAX_RETENTION_MS,
  type SignalFunnelObservation,
} from "@/analytics/signal-funnel";

export interface SignalFunnelStoreState {
  schemaVersion: 1;
  protocol: "phase-12-funnel-v1";
  observations: SignalFunnelObservation[];
}

export interface SignalFunnelStore {
  read(): Promise<SignalFunnelStoreState>;
  appendMany(
    observations: SignalFunnelObservation[],
    referenceAt: number
  ): Promise<SignalFunnelStoreState>;
}

export class JsonFileSignalFunnelStore implements SignalFunnelStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async read(): Promise<SignalFunnelStoreState> {
    const result = await readDurableJson(this.path, validateSignalFunnelStoreState);
    return result.value ?? emptySignalFunnelStoreState();
  }

  async appendMany(
    observations: SignalFunnelObservation[],
    referenceAt: number
  ): Promise<SignalFunnelStoreState> {
    return this.serialize(async () => {
      const state = await this.read();
      const next = mergeSignalFunnelObservations(
        state,
        observations,
        referenceAt
      );
      await writeDurableJson(this.path, next);
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
}

export function emptySignalFunnelStoreState(): SignalFunnelStoreState {
  return {
    schemaVersion: 1,
    protocol: "phase-12-funnel-v1",
    observations: [],
  };
}

export function mergeSignalFunnelObservations(
  state: SignalFunnelStoreState,
  incoming: SignalFunnelObservation[],
  referenceAt: number
): SignalFunnelStoreState {
  validateSignalFunnelStoreState(state);
  if (!Number.isFinite(referenceAt)) {
    throw new Error("Signal funnel referenceAt must be a finite timestamp.");
  }

  const byKey = new Map<string, SignalFunnelObservation>();
  for (const item of [...state.observations, ...incoming]) {
    validateObservation(item);
    byKey.set(signalFunnelObservationKey(item), structuredClone(item));
  }

  const cutoff = referenceAt - SIGNAL_FUNNEL_MAX_RETENTION_MS;
  const observations = [...byKey.values()]
    .filter((item) => item.observedAt >= cutoff)
    .sort((a, b) => a.observedAt - b.observedAt || a.symbol.localeCompare(b.symbol));

  return {
    schemaVersion: 1,
    protocol: "phase-12-funnel-v1",
    observations,
  };
}

export function signalFunnelObservationKey(
  observation: SignalFunnelObservation
): string {
  return [
    observation.symbol,
    observation.observedAt,
    observation.strategyId ?? "legacy",
  ].join(":");
}

export function validateSignalFunnelStoreState(
  state: SignalFunnelStoreState
): void {
  if (
    state.schemaVersion !== 1 ||
    state.protocol !== "phase-12-funnel-v1" ||
    !Array.isArray(state.observations)
  ) {
    throw new Error("Invalid Phase 12 signal funnel store.");
  }

  for (const observation of state.observations) {
    validateObservation(observation);
  }
}

function validateObservation(observation: SignalFunnelObservation): void {
  if (
    !observation ||
    typeof observation.symbol !== "string" ||
    observation.symbol.trim() === "" ||
    !Number.isFinite(observation.observedAt) ||
    !Array.isArray(observation.passedStages) ||
    typeof observation.deepestStage !== "string"
  ) {
    throw new Error("Invalid signal funnel observation.");
  }
}
