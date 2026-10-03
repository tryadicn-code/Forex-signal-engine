import "server-only";

import {
  DEFAULT_SYMBOL_UNIVERSE,
  SYMBOL_METADATA,
  normalizeSupportedSymbol,
} from "@/config/scanner";
import { STORAGE_PATHS } from "@/config/storage";
import {
  readDurableJson,
  writeDurableJson,
} from "@/persistence/durable-json";

export interface ScannerUniverseState {
  schemaVersion: 1;
  symbols: string[];
  updatedAt: number;
}

export interface ScannerUniverseView {
  selected: string[];
  supported: string[];
  updatedAt: number | null;
}

function sanitizeSymbols(symbols: string[]): string[] {
  return [...new Set(
    symbols
      .map((symbol) => normalizeSupportedSymbol(symbol))
      .filter((symbol): symbol is string => symbol !== null)
  )];
}

function validateState(value: ScannerUniverseState): void {
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.symbols) ||
    value.symbols.length === 0 ||
    value.symbols.some((symbol) => !SYMBOL_METADATA[symbol]) ||
    !Number.isFinite(value.updatedAt)
  ) {
    throw new Error("Invalid scanner universe store schema.");
  }
}

function fallbackSymbols(symbols?: string[]): string[] {
  const sanitized = sanitizeSymbols(symbols ?? DEFAULT_SYMBOL_UNIVERSE);
  return sanitized.length > 0 ? sanitized : [...DEFAULT_SYMBOL_UNIVERSE];
}

export async function readScannerUniverse(
  fallback?: string[]
): Promise<ScannerUniverseView> {
  const result = await readDurableJson(
    STORAGE_PATHS.scannerUniverse,
    validateState
  );
  const selected = result.value?.symbols ?? fallbackSymbols(fallback);

  return {
    selected: [...selected],
    supported: Object.keys(SYMBOL_METADATA),
    updatedAt: result.value?.updatedAt ?? null,
  };
}

async function saveScannerUniverse(symbols: string[]): Promise<ScannerUniverseView> {
  const selected = sanitizeSymbols(symbols);
  if (selected.length === 0) {
    throw new Error("Scanner universe must contain at least one pair.");
  }

  const state: ScannerUniverseState = {
    schemaVersion: 1,
    symbols: selected,
    updatedAt: Date.now(),
  };
  await writeDurableJson(STORAGE_PATHS.scannerUniverse, state);
  return {
    selected: [...state.symbols],
    supported: Object.keys(SYMBOL_METADATA),
    updatedAt: state.updatedAt,
  };
}

export async function addScannerSymbol(
  rawSymbol: string,
  fallback?: string[]
): Promise<ScannerUniverseView> {
  const symbol = normalizeSupportedSymbol(rawSymbol);
  if (!symbol) {
    throw new Error("Unsupported FX pair. Enter one of the supported 6-letter pairs.");
  }
  const current = await readScannerUniverse(fallback);
  return saveScannerUniverse([...current.selected, symbol]);
}

export async function removeScannerSymbol(
  rawSymbol: string,
  fallback?: string[]
): Promise<ScannerUniverseView> {
  const symbol = normalizeSupportedSymbol(rawSymbol);
  if (!symbol) throw new Error("Unsupported FX pair.");
  const current = await readScannerUniverse(fallback);
  if (!current.selected.includes(symbol)) return current;
  if (current.selected.length <= 1) {
    throw new Error("At least one scanner pair must remain enabled.");
  }
  return saveScannerUniverse(
    current.selected.filter((item) => item !== symbol)
  );
}
