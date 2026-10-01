/**
 * Central scanner configuration (Phase 2).
 *
 * Everything operational about the scanner lives here - the enabled symbol
 * universe, the multi-timeframe roles, signal TTL and freshness thresholds.
 * Nothing is hardcoded inside the scanner service, so a deployment can override
 * one knob without resupplying the rest.
 */

import type { Timeframe } from "@/types/market";
import type { SymbolMetadata } from "@/types/market-data";
import { cloneScannerConfig } from "@/config/scanner-resolve";
import {
  defaultEngineConfig,
  resolveConfig,
  type DeepPartial,
  type EngineConfig,
} from "@/core/config/engine-config";

// ---------------------------------------------------------------------------
// Symbol universe + metadata
// ---------------------------------------------------------------------------

/**
 * Supported FX catalog. The default scanner universe intentionally stays
 * smaller; operators can opt into additional crosses from the app.
 */
export const SUPPORTED_SYMBOL_UNIVERSE = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD", "USDCAD",
  "EURJPY", "GBPJPY", "EURGBP", "AUDJPY", "EURAUD", "GBPAUD",
  "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "CADJPY", "CHFJPY",
  "EURCAD", "EURCHF", "EURNZD", "GBPCAD", "GBPCHF", "GBPNZD",
  "NZDCAD", "NZDCHF", "NZDJPY",
] as const;

/** The 13-pair baseline used unless the operator explicitly changes it. */
export const DEFAULT_SYMBOL_UNIVERSE: string[] = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD", "USDCAD",
  "EURJPY", "GBPJPY", "EURGBP", "AUDJPY", "EURAUD", "GBPAUD",
];

function createFxMetadata(symbol: string): SymbolMetadata {
  const baseCurrency = symbol.slice(0, 3);
  const quoteCurrency = symbol.slice(3, 6);
  const jpyQuoted = quoteCurrency === "JPY";
  return {
    symbol,
    baseCurrency,
    quoteCurrency,
    pipSize: jpyQuoted ? 0.01 : 0.0001,
    pricePrecision: jpyQuoted ? 3 : 5,
    contractSize: 100_000,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
  };
}

/** Metadata for every pair the UI is allowed to add to the scanner. */
export const SYMBOL_METADATA: Record<string, SymbolMetadata> = Object.fromEntries(
  SUPPORTED_SYMBOL_UNIVERSE.map((symbol) => [symbol, createFxMetadata(symbol)])
);

export function normalizeSupportedSymbol(value: string): string | null {
  const symbol = value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return /^[A-Z]{6}$/.test(symbol) && Boolean(SYMBOL_METADATA[symbol])
    ? symbol
    : null;
}

// ---------------------------------------------------------------------------
// Timeframe roles
// ---------------------------------------------------------------------------

/**
 * The multi-timeframe strategy context.
 *
 * Each role names the timeframe that drives one stage family. Structures are
 * built per-timeframe from that timeframe's own candles; a higher timeframe
 * reaches a lower one only as price/time confluence.
 */
export interface TimeframeRoles {
  /** Macro technical context. */
  macro: Timeframe;
  /** Regime + directional bias. */
  bias: Timeframe;
  /** Setup / location. */
  setup: Timeframe;
  /** Trigger confirmation. */
  trigger: Timeframe;
}

export const DEFAULT_TIMEFRAME_ROLES: TimeframeRoles = {
  macro: "D1",
  bias: "H4",
  setup: "H1",
  trigger: "M15",
};

// ---------------------------------------------------------------------------
// Signal TTL (bar-aware expiration)
// ---------------------------------------------------------------------------

export interface SignalTtlConfig {
  /** How many closed trigger-timeframe candles a trigger stays valid for. */
  triggerBars: number;
  /** How many closed setup-timeframe candles a setup stays valid for. */
  setupBars: number;
}

export const DEFAULT_SIGNAL_TTL: SignalTtlConfig = {
  triggerBars: 3,
  setupBars: 6,
};

// ---------------------------------------------------------------------------
// Freshness thresholds
// ---------------------------------------------------------------------------

export interface FreshnessThresholds {
  /**
   * Age, measured in BARS of the timeframe being classified, at or below which
   * data is FRESH. Thresholds are timeframe-relative because a D1 bar that
   * closed hours ago is fresh for D1 while an M15 bar of the same age is stale.
   */
  freshBars: number;
  /** Age, in bars, at or below which data is DELAYED (above this it is STALE). */
  delayedBars: number;
}

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  freshBars: 1.5,
  delayedBars: 4,
};

// ---------------------------------------------------------------------------
// Account / execution
// ---------------------------------------------------------------------------

export interface AccountConfig {
  /** Currency the trading account is denominated in. */
  currency: string;
  /** Starting balance used for position sizing when no live balance exists. */
  balance: number;
  /** Risk percentage applied per trade when unspecified. */
  riskPercent: number;
}

export const DEFAULT_ACCOUNT: AccountConfig = {
  currency: "USD",
  balance: 10_000,
  riskPercent: 0.5,
};

// ---------------------------------------------------------------------------
// Scanner config
// ---------------------------------------------------------------------------

export interface ScannerConfig {
  /** Provider implementation id, e.g. "mock". */
  providerId: string;
  /** Economic-calendar provider id, e.g. "noop". */
  economicCalendarId: string;
  /** Enabled symbols; must be keys of SYMBOL_METADATA. */
  symbols: string[];
  timeframeRoles: TimeframeRoles;
  signalTtl: SignalTtlConfig;
  freshness: FreshnessThresholds;
  account: AccountConfig;
  /** Phase 1 strategy configuration pinned by the active release when present. */
  engineConfig: EngineConfig;
  /**
   * Operational mode. Phase 2 is SIGNAL_ONLY: the pipeline decides, it never
   * places an order and never connects a broker.
   */
  executionMode: ExecutionModeAlias;
  /** Candles requested per timeframe per symbol. */
  candleLookback: number;
}

export type ExecutionModeAlias = "SIGNAL_ONLY" | "PAPER" | "LIVE";

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  providerId: "mock",
  economicCalendarId: "noop",
  symbols: [...DEFAULT_SYMBOL_UNIVERSE],
  timeframeRoles: { ...DEFAULT_TIMEFRAME_ROLES },
  signalTtl: { ...DEFAULT_SIGNAL_TTL },
  freshness: { ...DEFAULT_FRESHNESS_THRESHOLDS },
  account: { ...DEFAULT_ACCOUNT },
  engineConfig: structuredClone(defaultEngineConfig),
  executionMode: "SIGNAL_ONLY",
  candleLookback: 220,
};

/**
 * Deep-merge a partial override onto the scanner defaults. Universe and roles
 * are replaced wholesale when supplied (arrays and leaf objects, not merged).
 */
export function resolveScannerConfig(
  overrides?: DeepPartial<ScannerConfig>
): ScannerConfig {
  // Always hand out a defensive copy, never the shared module-level default,
  // so a caller cannot mutate the global baseline through the object it gets.
  if (!overrides) return cloneScannerConfig(DEFAULT_SCANNER_CONFIG);
  const out: ScannerConfig = cloneScannerConfig(DEFAULT_SCANNER_CONFIG);
  for (const key of Object.keys(overrides) as Array<keyof ScannerConfig>) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (key === "engineConfig") {
      out.engineConfig = structuredClone(
        resolveConfig(value as DeepPartial<EngineConfig>)
      );
    } else if (key === "timeframeRoles" || key === "signalTtl" || key === "freshness" || key === "account") {
      out[key] = { ...out[key], ...(value as object) } as never;
    } else {
      out[key] = value as never;
    }
  }
  return out;
}
/** Resolve metadata for a symbol, throwing only on genuine misconfiguration. */
export function resolveSymbolMetadata(symbol: string): SymbolMetadata {
  const meta = SYMBOL_METADATA[symbol];
  if (!meta) {
    throw new Error(`Unknown symbol in scanner universe: ${symbol}`);
  }
  return meta;
}

/** Convert provider-facing metadata into the Phase 1 engine instrument. */
export function toCurrencyPair(meta: SymbolMetadata) {
  return {
    code: meta.symbol,
    base: meta.baseCurrency,
    quote: meta.quoteCurrency,
    name: `${meta.baseCurrency} / ${meta.quoteCurrency}`,
    pipSize: meta.pipSize,
    contractSize: meta.contractSize,
    digits: meta.pricePrecision,
    minLot: meta.minLot,
    maxLot: meta.maxLot,
    lotStep: meta.lotStep,
  };
}
