import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignalNarrative } from "@/components/signals/signal-narrative";
import {
  failureResult,
  type SymbolScanResult,
} from "@/scanner/scanner-result";

function result(overrides: Partial<SymbolScanResult> = {}): SymbolScanResult {
  return {
    ...failureResult("EURUSD", "ANALYSED", "Analysed successfully.", 0),
    bias: "SHORT",
    biasScore: -67,
    biasDirection: "SHORT",
    setupState: "WATCH",
    setupScore: 45,
    triggerState: "WAITING",
    triggerScore: 25,
    executionDecision: "WAIT",
    signalState: "WATCH",
    freshness: "FRESH",
    latestPrice: 1.11959,
    plannedLevels: {
      direction: "SHORT",
      entry: 1.1225,
      stop: 1.1255,
      takeProfit: 1.1165,
      rr: 2.0,
      zoneLow: 1.12208,
      zoneHigh: 1.12533,
      source: "test",
    },
    evidence: [
      {
        code: "BIAS_STRUCTURE",
        label: "Structure component",
        description:
          "Structure trend SHORT at strength 75, last BOS SHORT, last CHOCH LONG.",
      },
      {
        code: "BIAS_TREND",
        label: "Trend component",
        description: "EMA stack bearish, price below EMA20.",
      },
    ],
    ...overrides,
  };
}

describe("SignalNarrative", () => {
  it("renders the active stage narrative under the progress bar", () => {
    render(<SignalNarrative result={result()} />);

    // Setup is the active stage (Bias done, Setup WATCH)
    expect(screen.getByText(/SETUP/)).toBeInTheDocument();
    expect(screen.getByText(/FORMING/)).toBeInTheDocument();
    expect(screen.getByText(/45 \(min 60\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Waiting for price to reach supply zone/)
    ).toBeInTheDocument();
    expect(screen.getByText(/25 pips below/)).toBeInTheDocument();
  });

  it("renders the gates summary line when some gates are pending", () => {
    render(
      <SignalNarrative
        result={result({
          executionDetail: {
            decision: "WAIT",
            conditions: [
              { name: "bias_valid", passed: true, detail: "ok" },
              { name: "setup_valid", passed: true, detail: "ok" },
              { name: "trigger_confirmed", passed: false, detail: "waiting" },
              { name: "risk_approved", passed: false, detail: "waiting" },
            ],
            triggeredVetoes: [],
            reasons: [],
          },
        })}
      />
    );

    expect(
      screen.getByText(/2 \/ 4 gates passed/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/trigger_confirmed, risk_approved/)
    ).toBeInTheDocument();
  });

  it("hides the gates summary when all gates pass", () => {
    render(
      <SignalNarrative
        result={result({
          executionDetail: {
            decision: "WAIT",
            conditions: [
              { name: "bias_valid", passed: true, detail: "ok" },
              { name: "setup_valid", passed: true, detail: "ok" },
            ],
            triggeredVetoes: [],
            reasons: [],
          },
        })}
      />
    );

    expect(screen.queryByText(/gates passed/)).not.toBeInTheDocument();
  });

  it("renders the planned levels grid inside the hero card", () => {
    render(<SignalNarrative result={result()} />);

    expect(screen.getByText("Entry")).toBeInTheDocument();
    expect(screen.getByText("Stop")).toBeInTheDocument();
    expect(screen.getByText("Target")).toBeInTheDocument();
    expect(screen.getByText("Min R:R")).toBeInTheDocument();
    expect(screen.getByText(/1\.12250/)).toBeInTheDocument();
    expect(screen.getByText(/1\.12550/)).toBeInTheDocument();
    expect(screen.getByText(/1\.11650/)).toBeInTheDocument();
  });

  it("renders the Bias section with expanded abbreviations and strength label", () => {
    render(<SignalNarrative result={result()} />);

    expect(screen.getByText(/-67/)).toBeInTheDocument();
    expect(
      screen.getByText(/strength 75 \(very strong\)/)
    ).toBeInTheDocument();
    expect(screen.getByText(/break of structure/)).toBeInTheDocument();
    expect(screen.getByText(/change of character/)).toBeInTheDocument();
    expect(screen.queryByText(/\bBOS\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bCHOCH\b/)).not.toBeInTheDocument();
  });

  it("shows awaiting-confirmation body when price is inside the zone but state is SETUP", () => {
    render(
      <SignalNarrative
        result={result({
          setupState: "SETUP",
          signalState: "SETUP",
          latestPrice: 1.1235,
        })}
      />
    );

    expect(
      screen.getByText(/Price inside supply zone/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Awaiting confirmation to arm/)
    ).toBeInTheDocument();
  });

  it("shows setup narrative with no-zone body when plannedLevels is null", () => {
    render(
      <SignalNarrative
        result={result({ plannedLevels: null, setupScore: null })}
      />
    );

    expect(
      screen.getByText(
        /Setup engine is watching for price to approach a demand or supply zone\./
      )
    ).toBeInTheDocument();
  });

  it("shows the blocked narrative when execution is blocked", () => {
    render(
      <SignalNarrative
        result={result({
          executionDecision: "BLOCKED",
          signalState: "BLOCKED",
          executionDetail: {
            decision: "BLOCKED",
            conditions: [],
            triggeredVetoes: ["RR_TOO_LOW"],
            reasons: [],
          },
        })}
      />
    );

    // The active stage is Setup (blocked tone) and blockedReason prefixes the veto
    expect(screen.getByText(/RR_TOO_LOW/)).toBeInTheDocument();
  });

  it("shows the EXECUTE narrative when all gates passed", () => {
    render(
      <SignalNarrative
        result={result({
          executionDecision: "EXECUTE",
          signalState: "EXECUTE",
          setupState: "ARMED",
          triggerState: "CONFIRMED",
          riskDetail: {
            approved: true,
            rejectionReason: null,
            entryPrice: 1.1225,
            stopLoss: 1.1255,
            stopDistancePips: 30,
            takeProfit1: 1.1165,
            takeProfit2: 1.1145,
            plannedRR: 2.0,
          },
        })}
      />
    );

    expect(screen.getByText(/EXECUTE/)).toBeInTheDocument();
    expect(screen.getByText(/READY/)).toBeInTheDocument();
    expect(screen.getByText(/All gates passed\./)).toBeInTheDocument();
    expect(screen.getByText(/Entry 1\.12250/)).toBeInTheDocument();
  });

  it("omits the Bias section when bias is null", () => {
    render(
      <SignalNarrative result={result({ bias: null, biasScore: null })} />
    );

    expect(
      screen.queryByText(/Structure trend SHORT/)
    ).not.toBeInTheDocument();
  });
});