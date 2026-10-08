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
    triggerScore: 0,
    executionDecision: "WAIT",
    signalState: "WATCH",
    freshness: "FRESH",
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
  it("renders hero state, reason, and Bias section", () => {
    render(<SignalNarrative result={result()} />);

    expect(screen.getByText("WATCHING")).toBeInTheDocument();
    expect(screen.getByText("Watching for a valid setup.")).toBeInTheDocument();
    expect(screen.getByText(/Bias/)).toBeInTheDocument();
    expect(screen.getByText(/-67/)).toBeInTheDocument();
    expect(screen.getByText(/Structure trend SHORT/)).toBeInTheDocument();
    expect(screen.getByText(/EMA stack bearish/)).toBeInTheDocument();
  });

  it("renders BLOCKED with the first veto when execution is blocked", () => {
    render(
      <SignalNarrative
        result={result({
          executionDecision: "BLOCKED",
          executionDetail: {
            decision: "BLOCKED",
            conditions: [],
            triggeredVetoes: ["RR_TOO_LOW"],
            reasons: [],
          },
        })}
      />
    );

    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
    expect(
      screen.getByText("Execution blocked: RR_TOO_LOW.")
    ).toBeInTheDocument();
  });

  it("omits the Bias section when bias is null", () => {
    render(<SignalNarrative result={result({ bias: null, biasScore: null })} />);

    expect(screen.getByText("WATCHING")).toBeInTheDocument();
    expect(screen.queryByText(/Bias/)).not.toBeInTheDocument();
  });
});