import { IMPLEMENTED_STRATEGY_IDS } from "@/core/strategies/registry";
import type { ImplementedStrategyId } from "@/core/strategies/types";

/** Schema version for the persisted strategy config. */
export const STRATEGY_CONFIG_VERSION = 1;

export interface StrategyConfig {
  version: number;
  updatedAt: number;
  enabledStrategies: ImplementedStrategyId[];
}

export type StrategyConfigValidation =
  | { ok: true; config: StrategyConfig }
  | { ok: false; reason: string };

/**
 * Default: semua implemented strategy aktif. Dipakai ketika file config
 * belum ada atau corrupt, supaya behavior tetap backward compatible.
 */
export function defaultStrategyConfig(now: number = Date.now()): StrategyConfig {
  return {
    version: STRATEGY_CONFIG_VERSION,
    updatedAt: now,
    enabledStrategies: [...IMPLEMENTED_STRATEGY_IDS],
  };
}

/**
 * Validasi + normalisasi config mentah.
 * - enabledStrategies harus non-empty.
 * - Setiap ID harus ada di IMPLEMENTED_STRATEGY_IDS.
 * - Duplikat di-dedupe (mempertahankan urutan pertama).
 */
export function validateStrategyConfig(
  raw: unknown
): StrategyConfigValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "config bukan object" };
  }
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.enabledStrategies)) {
    return { ok: false, reason: "enabledStrategies harus array" };
  }

  const implementedSet = new Set<string>(IMPLEMENTED_STRATEGY_IDS);
  const seen = new Set<ImplementedStrategyId>();
  const normalized: ImplementedStrategyId[] = [];
  for (const entry of obj.enabledStrategies) {
    if (typeof entry !== "string") {
      return { ok: false, reason: "strategy ID harus string" };
    }
    if (!implementedSet.has(entry)) {
      return { ok: false, reason: `strategy tidak dikenal: ${entry}` };
    }
    const id = entry as ImplementedStrategyId;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  if (normalized.length === 0) {
    return { ok: false, reason: "minimal 1 strategy harus aktif" };
  }

  const version =
    typeof obj.version === "number" && Number.isFinite(obj.version)
      ? obj.version
      : STRATEGY_CONFIG_VERSION;
  const updatedAt =
    typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt)
      ? obj.updatedAt
      : Date.now();

  return {
    ok: true,
    config: { version, updatedAt, enabledStrategies: normalized },
  };
}

/**
 * High-level resolver: parse + validate, fallback ke default kalau gagal.
 * Return { config, usedDefault } supaya caller bisa log kalau ada fallback.
 */
export function resolveStrategyConfig(raw: unknown): {
  config: StrategyConfig;
  usedDefault: boolean;
} {
  const result = validateStrategyConfig(raw);
  if (result.ok) {
    return { config: result.config, usedDefault: false };
  }
  return { config: defaultStrategyConfig(), usedDefault: true };
}