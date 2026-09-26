import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SystemStatusPanel } from "@/components/system/system-status-panel";

describe("SystemStatusPanel", () => {
  it("renders the application title", () => {
    render(<SystemStatusPanel />);
    expect(
      screen.getByRole("heading", { name: /forex signal engine/i })
    ).toBeInTheDocument();
  });

  it("reports the Phase 1 operational state", () => {
    render(<SystemStatusPanel />);

    expect(screen.getByText("System Status:")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
    expect(screen.getByText("Core Engine:")).toBeInTheDocument();
    expect(screen.getByText("Not Initialized")).toBeInTheDocument();
    expect(screen.getByText("Market Scanner:")).toBeInTheDocument();
    expect(screen.getByText("Not Connected")).toBeInTheDocument();
    expect(screen.getByText("Execution Mode:")).toBeInTheDocument();
    expect(screen.getByText("SIGNAL ONLY")).toBeInTheDocument();
  });
});
