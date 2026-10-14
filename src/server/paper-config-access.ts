import "server-only";

import { STORAGE_PATHS } from "@/config/storage";
import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";
import {
  PAPER_CONFIG_VERSION,
  resolvePaperConfigState,
  validatePaperConfig,
  type EditablePaperConfig,
  type PaperConfigState,
} from "@/core/config/paper-config";
import { toPaperTradingConfig } from "@/core/config/paper-config";
import type { PaperTradingConfig } from "@/config/paper";

export interface PaperConfigAuditEntry {
  timestamp: number;
  source: string;
  previous: EditablePaperConfig;
  next: EditablePaperConfig;
}

const AUDIT_MAX_ENTRIES = 500;

function validatePersisted(value: PaperConfigState): void {
  const result = validatePaperConfig(value);
  if (!result.ok) {
    throw new Error(`Invalid paper config store: ${result.reason}`);
  }
}

function validateAudit(value: PaperConfigAuditEntry[]): void {
  if (!Array.isArray(value)) {
    throw new Error("Invalid paper config audit store: not an array.");
  }
  for (const entry of value) {
    if (
      typeof entry.timestamp !== "number" ||
      typeof entry.source !== "string" ||
      !entry.previous ||
      !entry.next
    ) {
      throw new Error("Invalid paper config audit entry shape.");
    }
  }
}

export async function readPaperConfigState(): Promise<{
  state: PaperConfigState;
  usedDefault: boolean;
}> {
  const result = await readDurableJson<PaperConfigState>(
    STORAGE_PATHS.paperConfig,
    validatePersisted
  );
  return resolvePaperConfigState(result.value ?? null);
}

export async function readPaperConfigAudit(): Promise<
  PaperConfigAuditEntry[]
> {
  const result = await readDurableJson<PaperConfigAuditEntry[]>(
    STORAGE_PATHS.paperConfigAudit,
    validateAudit
  );
  return result.value ?? [];
}

async function appendAuditEntry(entry: PaperConfigAuditEntry): Promise<void> {
  const existing = await readPaperConfigAudit();
  const next = [...existing, entry].slice(-AUDIT_MAX_ENTRIES);
  await writeDurableJson(STORAGE_PATHS.paperConfigAudit, next);
}

export async function savePaperConfig(
  config: EditablePaperConfig,
  source: string = "api"
): Promise<PaperConfigState> {
  const candidate: PaperConfigState = {
    version: PAPER_CONFIG_VERSION,
    updatedAt: Date.now(),
    config,
  };
  const validated = validatePaperConfig(candidate);
  if (!validated.ok) {
    throw new Error(validated.reason);
  }
  const current = await readPaperConfigState();
  await writeDurableJson(STORAGE_PATHS.paperConfig, validated.state);
  await appendAuditEntry({
    timestamp: validated.state.updatedAt,
    source,
    previous: current.state.config,
    next: validated.state.config,
  });
  return validated.state;
}

/**
 * Baca config paper dan gabungkan dengan default untuk mendapatkan
 * PaperTradingConfig lengkap. Dipakai oleh paper-trading-access.ts
 * untuk instantiate PaperTradingService.
 */
export async function readPaperTradingConfig(): Promise<{
  config: PaperTradingConfig;
  identity: string;
}> {
  const { state, usedDefault } = await readPaperConfigState();
  const config = toPaperTradingConfig(state.config);
  const identity = [
    "paper",
    `v${state.version}`,
    `t${state.updatedAt}`,
    usedDefault ? "default" : "custom",
  ].join(":");
  return { config, identity };
}