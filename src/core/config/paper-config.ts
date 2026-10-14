import type {
  IntrabarConflictPolicy,
  PaperTradingConfig,
} from "@/config/paper";
import { DEFAULT_PAPER_TRADING_CONFIG } from "@/config/paper";

/** Bumped when the persisted schema changes. */
export const PAPER_CONFIG_VERSION = 1;

/** Editable subset of PaperTradingConfig. */
export interface EditablePaperConfig {
  maxOpenPositions: number;
  maxTotalOpenRiskPercent: number;
  maxOpenPositionsPerSymbol: number;
  maxDirectionalCurrencyExposure: number;
  stopLossReentryCooldownMinutes: number;
  intrabarConflictPolicy: IntrabarConflictPolicy;
  allowDelayed: boolean;
  autoScanEnabled: boolean;
}

export interface PaperConfigState {
  version: number;
  updatedAt: number;
  config: EditablePaperConfig;
}

export type PaperConfigValidation =
  | { ok: true; state: PaperConfigState }
  | { ok: false; reason: string };

const NUMERIC_RANGES = {
  maxOpenPositions: { min: 1, max: 50, label: "maxOpenPositions" },
  maxTotalOpenRiskPercent: {
    min: 1,
    max: 100,
    label: "maxTotalOpenRiskPercent",
  },
  maxOpenPositionsPerSymbol: {
    min: 1,
    max: 20,
    label: "maxOpenPositionsPerSymbol",
  },
  maxDirectionalCurrencyExposure: {
    min: 1,
    max: 10,
    label: "maxDirectionalCurrencyExposure",
  },
  stopLossReentryCooldownMinutes: {
    min: 0,
    max: 1440,
    label: "stopLossReentryCooldownMinutes",
  },
} as const;

const CONFLICT_POLICIES: readonly IntrabarConflictPolicy[] = [
  "STOP_FIRST",
  "TARGET_FIRST",
  "REJECT_AMBIGUOUS",
];

/** Ekstrak field editable dari full PaperTradingConfig. */
export function toEditable(
  config: PaperTradingConfig
): EditablePaperConfig {
  return {
    maxOpenPositions: config.maxOpenPositions,
    maxTotalOpenRiskPercent: config.maxTotalOpenRiskPercent,
    maxOpenPositionsPerSymbol: config.maxOpenPositionsPerSymbol,
    maxDirectionalCurrencyExposure: config.maxDirectionalCurrencyExposure,
    stopLossReentryCooldownMinutes: Math.round(
      config.stopLossReentryCooldownMs / 60_000
    ),
    intrabarConflictPolicy: config.intrabarConflictPolicy,
    allowDelayed: config.allowDelayed,
    autoScanEnabled: config.autoScanEnabled,
  };
}

/** Gabung field editable kembali ke full PaperTradingConfig. */
export function toPaperTradingConfig(
  editable: EditablePaperConfig
): PaperTradingConfig {
  return {
    ...DEFAULT_PAPER_TRADING_CONFIG,
    maxOpenPositions: editable.maxOpenPositions,
    maxTotalOpenRiskPercent: editable.maxTotalOpenRiskPercent,
    maxOpenPositionsPerSymbol: editable.maxOpenPositionsPerSymbol,
    maxDirectionalCurrencyExposure:
      editable.maxDirectionalCurrencyExposure,
    stopLossReentryCooldownMs: editable.stopLossReentryCooldownMinutes * 60_000,
    intrabarConflictPolicy: editable.intrabarConflictPolicy,
    allowDelayed: editable.allowDelayed,
    autoScanEnabled: editable.autoScanEnabled,
  };
}

export function defaultPaperConfigState(
  now: number = Date.now()
): PaperConfigState {
  return {
    version: PAPER_CONFIG_VERSION,
    updatedAt: now,
    config: toEditable(DEFAULT_PAPER_TRADING_CONFIG),
  };
}

function validateNumber(
  value: unknown,
  range: { min: number; max: number; label: string }
): { ok: true; value: number } | { ok: false; reason: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, reason: `${range.label} harus number` };
  }
  if (value < range.min || value > range.max) {
    return {
      ok: false,
      reason: `${range.label} harus di antara ${range.min} dan ${range.max}`,
    };
  }
  return { ok: true, value };
}

export function validatePaperConfig(raw: unknown): PaperConfigValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "config bukan object" };
  }
  const obj = raw as Record<string, unknown>;

  const cfgRaw = obj.config;
  if (!cfgRaw || typeof cfgRaw !== "object") {
    return { ok: false, reason: "config.config bukan object" };
  }
  const cfg = cfgRaw as Record<string, unknown>;

  const checked: Partial<EditablePaperConfig> = {};

  for (const [key, range] of Object.entries(NUMERIC_RANGES)) {
    const result = validateNumber(cfg[key], range);
    if (!result.ok) return { ok: false, reason: result.reason };
    (checked as Record<string, unknown>)[key] = result.value;
  }

  if (
    typeof cfg.intrabarConflictPolicy !== "string" ||
    !CONFLICT_POLICIES.includes(cfg.intrabarConflictPolicy as IntrabarConflictPolicy)
  ) {
    return {
      ok: false,
      reason: `intrabarConflictPolicy harus salah satu dari ${CONFLICT_POLICIES.join(", ")}`,
    };
  }
  checked.intrabarConflictPolicy =
    cfg.intrabarConflictPolicy as IntrabarConflictPolicy;

  if (typeof cfg.allowDelayed !== "boolean") {
    return { ok: false, reason: "allowDelayed harus boolean" };
  }
  checked.allowDelayed = cfg.allowDelayed;

  if (typeof cfg.autoScanEnabled !== "boolean") {
    return { ok: false, reason: "autoScanEnabled harus boolean" };
  }
  checked.autoScanEnabled = cfg.autoScanEnabled;

  const version =
    typeof obj.version === "number" && Number.isFinite(obj.version)
      ? obj.version
      : PAPER_CONFIG_VERSION;
  const updatedAt =
    typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt)
      ? obj.updatedAt
      : Date.now();

  return {
    ok: true,
    state: {
      version,
      updatedAt,
      config: checked as EditablePaperConfig,
    },
  };
}

export function resolvePaperConfigState(raw: unknown): {
  state: PaperConfigState;
  usedDefault: boolean;
} {
  const result = validatePaperConfig(raw);
  if (result.ok) return { state: result.state, usedDefault: false };
  return { state: defaultPaperConfigState(), usedDefault: true };
}