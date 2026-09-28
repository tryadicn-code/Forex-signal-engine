import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUERY,
  applyScannerQuery,
  filterAndSort,
  sortScannerResults,
  type ScannerQuery,
} from "@/lib/scanner-query";
import { failureResult, type SymbolScanResult } from "@/scanner/scanner-result";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function result(
  symbol: string,
  overrides: Partial<SymbolScanResult> = {}
): SymbolScanResult {
  return {
    ...failureResult(symbol, "ANALYSED", "Analysed successfully.", T0),
    status: "ANALYSED",
    latestPrice: symbol.endsWith("JPY") ? 156.25 : 1.085,
    bias: "LONG",
    biasScore: 55,
    biasDirection: "LONG",
    setupState: "ARMED",
    setupScore: 70,
    triggerState: "WAITING",
    riskReward: 2.25,
    executionDecision: "WAIT",
    signalState: "ARMED",
    freshness: "FRESH",
    ...overrides,
  };
}

describe("Phase 3 scanner query", () => {
  it("searches symbols case-insensitively", () => {
    const rows = [result("EURUSD"), result("GBPUSD")];
    const query: ScannerQuery = { ...DEFAULT_QUERY, query: "eur" };

    expect(applyScannerQuery(rows, query).map((row) => row.symbol)).toEqual([
      "EURUSD",
    ]);
  });

  it("filters by direction", () => {
    const rows = [
      result("EURUSD", { biasDirection: "LONG" }),
      result("GBPUSD", { biasDirection: "SHORT", bias: "SHORT" }),
    ];

    expect(
      applyScannerQuery(rows, { ...DEFAULT_QUERY, direction: "SHORT" }).map(
        (row) => row.symbol
      )
    ).toEqual(["GBPUSD"]);
  });

  it("filters stale data explicitly", () => {
    const rows = [
      result("EURUSD", { freshness: "FRESH" }),
      result("USDCHF", { freshness: "STALE" }),
    ];

    expect(
      applyScannerQuery(rows, { ...DEFAULT_QUERY, freshness: "STALE" }).map(
        (row) => row.symbol
      )
    ).toEqual(["USDCHF"]);
  });

  it("filters blocked states using engine output", () => {
    const rows = [
      result("EURUSD", { executionDecision: "EXECUTE", signalState: "EXECUTE" }),
      result("GBPUSD", { executionDecision: "BLOCKED", signalState: "BLOCKED" }),
    ];

    expect(
      applyScannerQuery(rows, { ...DEFAULT_QUERY, state: "BLOCKED" }).map(
        (row) => row.symbol
      )
    ).toEqual(["GBPUSD"]);
  });

  it("filters per-symbol failures without affecting analysed rows", () => {
    const failed = failureResult(
      "GBPAUD",
      "PROVIDER_FAILURE",
      "Provider unavailable.",
      T0,
      ["feed down"]
    );
    const rows = [result("EURUSD"), failed];

    expect(
      applyScannerQuery(rows, { ...DEFAULT_QUERY, state: "FAILED" }).map(
        (row) => row.symbol
      )
    ).toEqual(["GBPAUD"]);
  });

  it("keeps missing sort values last in either direction", () => {
    const rows = [
      result("EURUSD", { riskReward: 2.5 }),
      result("GBPUSD", { riskReward: null }),
      result("USDJPY", { riskReward: 1.8 }),
    ];

    expect(
      sortScannerResults(rows, { key: "riskReward", dir: "asc" }).at(-1)?.symbol
    ).toBe("GBPUSD");
    expect(
      sortScannerResults(rows, { key: "riskReward", dir: "desc" }).at(-1)?.symbol
    ).toBe("GBPUSD");
  });

  it("uses the fixed visual attention order without changing engine fields", () => {
    const execute = result("EURUSD", {
      executionDecision: "EXECUTE",
      signalState: "EXECUTE",
    });
    const blocked = result("GBPUSD", {
      executionDecision: "BLOCKED",
      signalState: "BLOCKED",
    });
    const wait = result("USDJPY", {
      executionDecision: "WAIT",
      signalState: "WATCH",
    });

    const ordered = filterAndSort(
      [blocked, wait, execute],
      DEFAULT_QUERY,
      { key: "attention", dir: "asc" }
    );

    expect(ordered.map((row) => row.symbol)).toEqual([
      "EURUSD",
      "USDJPY",
      "GBPUSD",
    ]);
    expect(blocked.executionDecision).toBe("BLOCKED");
  });
});
