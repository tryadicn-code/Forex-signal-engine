import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignalHeroNarrative } from "@/components/signals/signal-hero-narrative";
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

describe("SignalHeroNarrative (Fase A)", () => {
  it("renders hero state and reason for a WATCHING signal", () => {
    render(<SignalHeroNarrative result={result()} />);

    expect(screen.getByText("WATCHING")).toBeInTheDocument();
    expect(
      screen.getByText("Menunggu kondisi setup yang valid.")
    ).toBeInTheDocument();
  });

  it("renders the 5-stage progress bar", () => {
    render(<SignalHeroNarrative result={result()} />);

    const progress = screen.getByLabelText("Signal pipeline progress");
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveTextContent("Bias");
    expect(progress).toHaveTextContent("Setup");
    expect(progress).toHaveTextContent("Trigger");
    expect(progress).toHaveTextContent("Risk");
    expect(progress).toHaveTextContent("Execute");
  });

  it("renders the Bias section with score and at least one reason bullet", () => {
    render(<SignalHeroNarrative result={result()} />);

    expect(screen.getByRole("heading", { name: /Bias/ })).toBeInTheDocument();
    expect(screen.getByText("-67")).toBeInTheDocument();
    expect(
      screen.getByText(/Structure trend SHORT at strength 75 \(very strong\)/)
    ).toBeInTheDocument();
  });

  it("renders hero state BLOCKED when execution decision blocks", () => {
    render(
      <SignalHeroNarrative
        result={result({
          executionDecision: "BLOCKED",
          signalState: "BLOCKED",
        })}
      />
    );

    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
  });

  it("omits the Bias section when bias is null", () => {
    render(
      <SignalHeroNarrative
        result={result({
          bias: null,
          biasScore: null,
          biasDirection: null,
        })}
      />
    );

    expect(screen.queryByRole("heading", { name: /Bias/ })).not.toBeInTheDocument();
  });
});