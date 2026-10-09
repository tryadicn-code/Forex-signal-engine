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
        description: "Structure trend SHORT at strength 75, last BOS SHORT.",
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
  it("renders the rich watching narrative with zone, distance, and setup score", () => {
    render(<SignalNarrative result={result()} />);

    expect(
      screen.getByText(/Waiting for price to reach the supply zone/)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/1\.12208/).length).toBeGreaterThan(0);
    expect(screen.getByText(/25 pips below/)).toBeInTheDocument();
    expect(screen.getByText(/Setup score 45\/60/)).toBeInTheDocument();
  });

  it("renders the Bias section with the signed score and evidence bullets", () => {
    render(<SignalNarrative result={result()} />);

    expect(screen.getByText(/-67/)).toBeInTheDocument();
    expect(screen.getByText(/Structure trend SHORT/)).toBeInTheDocument();
    expect(screen.getByText(/EMA stack bearish/)).toBeInTheDocument();
  });

  it("renders the blocked narrative with the first veto", () => {
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

    expect(
      screen.getByText("Execution blocked: RR_TOO_LOW.")
    ).toBeInTheDocument();
  });

  it("renders the ready narrative with the levels summary", () => {
    render(
      <SignalNarrative
        result={result({
          executionDecision: "EXECUTE",
          signalState: "EXECUTE",
        })}
      />
    );

    expect(screen.getByText(/All gates passed\./)).toBeInTheDocument();
    expect(screen.getByText(/Entry 1\.12250/)).toBeInTheDocument();
    expect(screen.getByText(/RR 1:2\.00/)).toBeInTheDocument();
  });


  it("renders the generic watching narrative when no setup zone exists", () => {
    render(
      <SignalNarrative
        result={result({ plannedLevels: null, setupScore: null })}
      />
    );

    expect(
      screen.getByText(/Watching for a valid setup\./)
    ).toBeInTheDocument();
    expect(screen.getByText(/Bias SHORT at strength 67/)).toBeInTheDocument();
    expect(
      screen.getByText(/No setup zone formed yet/)
    ).toBeInTheDocument();
  });

  it("renders the Setup card with state, score, and zone", () => {
    render(<SignalNarrative result={result()} />);

    expect(screen.getByText(/Setup —/)).toBeInTheDocument();
    expect(screen.getByText(/FORMING/)).toBeInTheDocument();
    expect(screen.getByText(/45 \(min 60\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Waiting for price to reach supply zone/)
    ).toBeInTheDocument();
  });

  it("renders the Trigger card with state and score", () => {
    render(<SignalNarrative result={result()} />);

    expect(screen.getByText(/Trigger —/)).toBeInTheDocument();
    expect(screen.getByText(/WAITING/)).toBeInTheDocument();
    expect(screen.getByText(/25 \(min 80\)/)).toBeInTheDocument();
  });

  it("renders the Risk card as PENDING when no risk has been evaluated", () => {
    render(<SignalNarrative result={result()} />);

    expect(screen.getByText(/Risk —/)).toBeInTheDocument();
    expect(screen.getByText(/PENDING/)).toBeInTheDocument();
    expect(
      screen.getByText(/Risk will be evaluated after the trigger confirms\./)
    ).toBeInTheDocument();
  });

  it("renders the Risk card as APPROVED with the levels summary", () => {
    render(
      <SignalNarrative
        result={result({
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

    expect(screen.getByText(/APPROVED/)).toBeInTheDocument();
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