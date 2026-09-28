/**
 * Scanner table query logic.
 *
 * PURE presentation functions: filtering, searching and sorting over already-
 * computed scanner results. Nothing here touches the scanner, re-runs analysis,
 * or re-weights any engine output. Sorting by "attention" uses only the fixed
 * visual rank the spec defines for state display.
 */

import type { SymbolScanResult } from "@/scanner/scanner-result";
import type { Direction, ExecutionDecision, SignalState } from "@/types/market";
import type { FreshnessStatus } from "@/types/market-data";
import { rowAttentionRank } from "@/lib/signal-meta";

export type StateFilter =
  | "ALL"
  | "EXECUTE"
  | "TRIGGERED"
  | "ARMED"
  | "SETUP"
  | "WATCH"
  | "BLOCKED"
  | "TERMINAL"
  | "FAILED";

export type DirectionFilter = "ALL" | Direction;
export type FreshnessFilter = "ALL" | FreshnessStatus;

export type SortKey =
  | "attention"
  | "symbol"
  | "biasScore"
  | "setupScore"
  | "riskReward"
  | "updatedAt";

export type SortDir = "asc" | "desc";

export interface ScannerQuery {
  query: string;
  state: StateFilter;
  direction: DirectionFilter;
  freshness: FreshnessFilter;
}

export const DEFAULT_QUERY: ScannerQuery = {
  query: "",
  state: "ALL",
  direction: "ALL",
  freshness: "ALL",
};

export const DEFAULT_SORT: ScannerSort = { key: "attention", dir: "asc" };

export interface ScannerSort {
  key: SortKey;
  dir: SortDir;
}

export const STATE_FILTER_LABELS: Record<StateFilter, string> = {
  ALL: "All",
  EXECUTE: "Execute",
  TRIGGERED: "Triggered",
  ARMED: "Armed",
  SETUP: "Setup",
  WATCH: "Watch",
  BLOCKED: "Blocked",
  TERMINAL: "Invalidated / Closed",
  FAILED: "Failed",
};

/** True when the result matches the state chip the user picked. */
function matchesState(result: SymbolScanResult, filter: StateFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "FAILED") return result.status !== "ANALYSED";
  if (filter === "TERMINAL") {
    return (
      result.signalState === "CLOSED" ||
      result.signalState === "INVALIDATED" ||
      result.executionDecision === "INVALIDATED"
    );
  }
  if (filter === "EXECUTE") {
    return result.executionDecision === "EXECUTE" || result.signalState === "EXECUTE";
  }
  if (filter === "TRIGGERED") {
    return result.signalState === "TRIGGERED" || result.triggerState === "CONFIRMED";
  }
  if (filter === "ARMED") {
    return result.signalState === "ARMED" || result.setupState === "ARMED";
  }
  if (filter === "SETUP") {
    return result.signalState === "SETUP" || result.setupState === "SETUP";
  }
  if (filter === "WATCH") {
    return result.signalState === "WATCH" || result.setupState === "WATCH";
  }
  if (filter === "BLOCKED") {
    return result.executionDecision === "BLOCKED" || result.signalState === "BLOCKED";
  }
  return true;
}

export function applyScannerQuery(
  results: SymbolScanResult[],
  query: ScannerQuery
): SymbolScanResult[] {
  const needle = query.query.trim().toUpperCase();
  return results.filter((result) => {
    if (needle && !result.symbol.includes(needle)) return false;
    if (!matchesState(result, query.state)) return false;
    if (query.direction !== "ALL" && result.biasDirection !== query.direction) return false;
    if (query.freshness !== "ALL" && result.freshness !== query.freshness) return false;
    return true;
  });
}

type Sortable = Extract<
  SymbolScanResult,
  { symbol: string; biasScore: number | null; setupScore: number | null; riskReward: number | null; updatedAt: number | null }
>;

function sortValue(result: SymbolScanResult, key: SortKey): number | string | null {
  if (key === "attention") {
    return rowAttentionRank({
      executionDecision: result.executionDecision as ExecutionDecision | null,
      signalState: result.signalState as SignalState | null,
    });
  }
  const typed = result as Sortable;
  switch (key) {
    case "symbol":
      return typed.symbol;
    case "biasScore":
    case "setupScore":
    case "riskReward":
    case "updatedAt":
      return typed[key];
    default:
      return 0;
  }
}

/**
 * Sort results by the chosen column. Missing values always sort last, in either
 * direction, so a pair with no R:R never outranks one that has one.
 */
export function sortScannerResults(
  results: SymbolScanResult[],
  sort: ScannerSort
): SymbolScanResult[] {
  const direction = sort.dir === "asc" ? 1 : -1;
  return [...results].sort((a, b) => {
    const valueA = sortValue(a, sort.key);
    const valueB = sortValue(b, sort.key);
    const aMissing = valueA === null || valueA === undefined;
    const bMissing = valueB === null || valueB === undefined;
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (typeof valueA === "string" || typeof valueB === "string") {
      return String(valueA).localeCompare(String(valueB)) * direction;
    }
    return ((valueA as number) - (valueB as number)) * direction;
  });
}

export function filterAndSort(
  results: SymbolScanResult[],
  query: ScannerQuery,
  sort: ScannerSort
): SymbolScanResult[] {
  return sortScannerResults(applyScannerQuery(results, query), sort);
}

/** True when any active filter would hide results. */
export function hasActiveQuery(query: ScannerQuery): boolean {
  return (
    query.query.trim() !== "" ||
    query.state !== "ALL" ||
    query.direction !== "ALL" ||
    query.freshness !== "ALL"
  );
}
