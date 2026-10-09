import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceList } from "@/components/signals/evidence-list";
import type { Evidence } from "@/types/engine";

describe("EvidenceList classifier", () => {
  it("groups structure points into their own section", () => {
    const evidence: Evidence[] = [
      {
        code: "STRUCTURE_HL",
        label: "Structure point HL",
        description: "HL at index 1, price 1.12.",
      },
      {
        code: "STRUCTURE_LH",
        label: "Structure point LH",
        description: "LH at index 2, price 1.13.",
      },
      {
        code: "STRUCTURE_LL",
        label: "Structure point LL",
        description: "LL at index 3, price 1.11.",
      },
      {
        code: "STRUCTURE_HH",
        label: "Structure point HH",
        description: "HH at index 4, price 1.14.",
      },
    ];

    render(<EvidenceList evidence={evidence} />);

    expect(screen.getByText("Structure points")).toBeInTheDocument();
    expect(screen.queryByText("Other evidence")).not.toBeInTheDocument();
  });

  it("groups BOS / CHOCH / structural breaks into structural events", () => {
    const evidence: Evidence[] = [
      { code: "SWING_COUNT", label: "Swing points detected", description: "x" },
      { code: "BOS", label: "Break of structure", description: "x" },
      { code: "CHOCH", label: "Change of character", description: "x" },
      { code: "BREAK_EVENTS", label: "Structural breaks", description: "x" },
    ];

    render(<EvidenceList evidence={evidence} />);

    expect(screen.getByText("Structural events")).toBeInTheDocument();
    expect(screen.queryByText("Other evidence")).not.toBeInTheDocument();
  });

  it("groups EQUAL_HIGH / EQUAL_LOW into liquidity levels", () => {
    const evidence: Evidence[] = [
      { code: "EQUAL_HIGH", label: "Equal highs", description: "x" },
      { code: "EQUAL_LOW", label: "Equal lows", description: "x" },
    ];

    render(<EvidenceList evidence={evidence} />);

    expect(screen.getByText("Liquidity levels")).toBeInTheDocument();
    expect(screen.queryByText("Other evidence")).not.toBeInTheDocument();
  });

  it("keeps unclassified codes in Other evidence", () => {
    const evidence: Evidence[] = [
      { code: "ATR_VOLATILITY", label: "ATR volatility", description: "x" },
      { code: "REWARD_RISK", label: "Reward risk", description: "x" },
    ];

    render(<EvidenceList evidence={evidence} />);

    expect(screen.getByText("Other evidence")).toBeInTheDocument();
  });

  it("groups BIAS_* codes into bias components", () => {
    const evidence: Evidence[] = [
      { code: "BIAS_STRUCTURE", label: "Structure component", description: "x" },
      { code: "BIAS_TREND", label: "Trend component", description: "x" },
      { code: "WEIGHTED_SUM", label: "Weighted bias score", description: "x" },
    ];

    render(<EvidenceList evidence={evidence} />);

    expect(screen.getByText("Bias components")).toBeInTheDocument();
  });
});