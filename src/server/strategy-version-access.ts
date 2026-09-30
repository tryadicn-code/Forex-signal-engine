import { JsonFileBacktestRunStore } from "@/server/backtest-run-store";
import { JsonFileStrategyVersionStore } from "@/server/strategy-version-store";
import {
  buildStrategyVersionManifest,
} from "@/replay/strategy-version-registry";
import type {
  DeprecateStrategyVersionInput,
  RegisterStrategyVersionInput,
  RollbackStrategyVersionInput,
  StrategyVersionRegistry,
} from "@/replay/strategy-version-types";

const backtests = new JsonFileBacktestRunStore();
const registry = new JsonFileStrategyVersionStore();

type StrategyRegistryGlobal = typeof globalThis & {
  __fseStrategyRegistryMutationQueue?: Promise<void>;
};

export async function readStrategyVersionRegistry(): Promise<StrategyVersionRegistry> {
  return registry.read();
}

export async function registerStrategyVersion(
  input: RegisterStrategyVersionInput
): Promise<StrategyVersionRegistry> {
  const report = await backtests.read(input.sourceReportId);
  if (!report) {
    throw new Error("Source validation report was not found.");
  }
  const manifest = buildStrategyVersionManifest(report, input);
  return withRegistryMutation(() => registry.register(manifest, input));
}

export async function deprecateStrategyVersion(
  input: DeprecateStrategyVersionInput
): Promise<StrategyVersionRegistry> {
  return withRegistryMutation(() => registry.deprecate(input));
}


export async function rollbackStrategyVersion(
  input: RollbackStrategyVersionInput
): Promise<StrategyVersionRegistry> {
  return withRegistryMutation(() => registry.rollback(input));
}

async function withRegistryMutation<T>(work: () => Promise<T>): Promise<T> {
  const runtime = globalThis as StrategyRegistryGlobal;
  const previous =
    runtime.__fseStrategyRegistryMutationQueue ?? Promise.resolve();

  let resolveGate: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    resolveGate = resolve;
  });
  runtime.__fseStrategyRegistryMutationQueue = previous
    .catch(() => undefined)
    .then(() => gate);

  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    resolveGate();
  }
}
