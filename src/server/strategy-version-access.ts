import { JsonFileBacktestRunStore } from "@/server/backtest-run-store";
import { JsonFileStrategyVersionStore } from "@/server/strategy-version-store";
import {
  buildStrategyVersionManifest,
} from "@/replay/strategy-version-registry";
import type {
  DeprecateStrategyVersionInput,
  RegisterStrategyVersionInput,
  StrategyVersionRegistry,
} from "@/replay/strategy-version-types";

const backtests = new JsonFileBacktestRunStore();
const registry = new JsonFileStrategyVersionStore();

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
  return registry.register(manifest, input);
}

export async function deprecateStrategyVersion(
  input: DeprecateStrategyVersionInput
): Promise<StrategyVersionRegistry> {
  return registry.deprecate(input);
}
