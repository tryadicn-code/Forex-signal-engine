import "server-only";

import { STORAGE_PATHS } from "@/config/storage";
import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";
import {
  STRATEGY_CONFIG_VERSION,
  validateStrategyConfig,
  resolveStrategyConfig,
  type StrategyConfig,
} from "@/core/strategies/strategy-config";
import type { ImplementedStrategyId } from "@/core/strategies/types";

export interface StrategyConfigAuditEntry {
  timestamp: number;
  source: string;
  previous: ImplementedStrategyId[];
  next: ImplementedStrategyId[];
}

const AUDIT_MAX_ENTRIES = 500;

function validatePersistedConfig(value: StrategyConfig): void {
  const result = validateStrategyConfig(value);
  if (!result.ok) {
    throw new Error(`Invalid strategy config store: ${result.reason}`);
  }
}

function validateAuditArray(value: StrategyConfigAuditEntry[]): void {
  if (!Array.isArray(value)) {
    throw new Error("Invalid strategy config audit store: not an array.");
  }
  for (const entry of value) {
    if (
      typeof entry.timestamp !== "number" ||
      typeof entry.source !== "string" ||
      !Array.isArray(entry.previous) ||
      !Array.isArray(entry.next)
    ) {
      throw new Error("Invalid strategy config audit entry shape.");
    }
  }
}

export async function readStrategyConfigState(): Promise<{
  config: StrategyConfig;
  usedDefault: boolean;
}> {
  const result = await readDurableJson<StrategyConfig>(
    STORAGE_PATHS.strategyConfig,
    validatePersistedConfig
  );
  return resolveStrategyConfig(result.value ?? null);
}

export async function readStrategyConfigAudit(): Promise<
  StrategyConfigAuditEntry[]
> {
  const result = await readDurableJson<StrategyConfigAuditEntry[]>(
    STORAGE_PATHS.strategyConfigAudit,
    validateAuditArray
  );
  return result.value ?? [];
}

async function appendAuditEntry(
  entry: StrategyConfigAuditEntry
): Promise<void> {
  const existing = await readStrategyConfigAudit();
  const next = [...existing, entry].slice(-AUDIT_MAX_ENTRIES);
  await writeDurableJson(STORAGE_PATHS.strategyConfigAudit, next);
}

export async function saveStrategyConfig(
  enabled: ImplementedStrategyId[],
  source: string = "api"
): Promise<StrategyConfig> {
  const validated = validateStrategyConfig({
    version: STRATEGY_CONFIG_VERSION,
    updatedAt: Date.now(),
    enabledStrategies: enabled,
  });
  if (!validated.ok) {
    throw new Error(validated.reason);
  }
  const current = await readStrategyConfigState();
  await writeDurableJson(STORAGE_PATHS.strategyConfig, validated.config);
  await appendAuditEntry({
    timestamp: validated.config.updatedAt,
    source,
    previous: current.config.enabledStrategies,
    next: validated.config.enabledStrategies,
  });
  return validated.config;
}