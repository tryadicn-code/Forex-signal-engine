import { describe, expect, it } from "vitest";
import { summarizeResults } from "@/components/dashboard/dashboard-summary";
import {
  failureResult,
  type SymbolScanResult,
} from "@/scanner/scanner-result";

function analysed(overrides: Partial<SymbolScanResult> = {}): SymbolScanResult {
  return {
    ...failureResult("EURUSD", "ANALYSED", "Analysed.", 0),
    executionDecision: null,
    signalState: null,
    freshness: "FRESH",
    ...overrides,
  };
}

describe("summarizeResults", () => {
  it("returns all zeros for an empty array", () => {
    const out = summarizeResults([]);
    expect(out).toEqual({
      scanned: 0,
      ready: 0,
      engineExecute: 0,
      blocked: 0,
      armed: 0,
      dataIssues: 0,
    });
  });

  it("counts ready only when executionDecision AND signalState are EXECUTE", () => {
    const out = summarizeResults([
      analysed({ executionDecision: "EXECUTE", signalState: "EXECUTE" }),
      analysed({ executionDecision: "EXECUTE", signalState: "WATCH" }),
      analysed({ executionDecision: "WAIT", signalState: "EXECUTE" }),
    ]);
    expect(out.ready).toBe(1);
    expect(out.engineExecute).toBe(2);
    expect(out.scanned).toBe(3);
  });

  it("counts blocked from either executionDecision or signalState", () => {
    const out = summarizeResults([
      analysed({ executionDecision: "BLOCKED" }),
      analysed({ signalState: "BLOCKED" }),
      analysed({ executionDecision: "BLOCKED", signalState: "BLOCKED" }),
      analysed({ executionDecision: "WAIT" }),
    ]);
    expect(out.blocked).toBe(3);
  });

  it("counts armed from either setupState or signalState", () => {
    const out = summarizeResults([
      analysed({ setupState: "ARMED" }),
      analysed({ signalState: "ARMED" }),
      analysed({ setupState: "SETUP" }),
      analysed({ signalState: "WATCH" }),
    ]);
    expect(out.armed).toBe(2);
  });

  it("counts dataIssues for non-analysed status, delayed, or stale freshness", () => {
    const out = summarizeResults([
      failureResult("EURUSD", "PROVIDER_FAILURE", "no data", 0),
      analysed({ freshness: "DELAYED" }),
      analysed({ freshness: "STALE" }),
      analysed({ freshness: "FRESH" }),
    ]);
    expect(out.dataIssues).toBe(3);
    expect(out.scanned).toBe(4);
  });

  it("treats null freshness as not a data issue", () => {
    const out = summarizeResults([analysed({ freshness: null })]);
    expect(out.dataIssues).toBe(0);
  });

  it("aggregates mixed states correctly", () => {
    const out = summarizeResults([
      analysed({ executionDecision: "EXECUTE", signalState: "EXECUTE" }),
      analysed({ setupState: "ARMED", freshness: "DELAYED" }),
      analysed({ signalState: "BLOCKED" }),
      failureResult("GBPUSD", "PROVIDER_FAILURE", "fail", 0),
    ]);
    expect(out).toEqual({
      scanned: 4,
      ready: 1,
      engineExecute: 1,
      blocked: 1,
      armed: 1,
      dataIssues: 2,
    });
  });
});