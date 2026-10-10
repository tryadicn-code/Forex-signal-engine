import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

describe("DashboardShell", () => {
  it("renders header, children slot, and command palette trigger", () => {
    render(
      <DashboardShell>
        <div data-testid="slot">slot</div>
      </DashboardShell>
    );

    expect(
      screen.getByLabelText(/Forex Signal Engine dashboard/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("slot")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Open command palette/i)
    ).toBeInTheDocument();
  });

  it("declares the 'use client' directive at the top of the module", () => {
    // Regression guard: the shell wires interactive UI (command palette
    // button and client child) into the header, so the module must stay a
    // Client Component. Removing the directive breaks the Next.js App Router
    // render at runtime for every page that uses DashboardShell.
    const shellPath = path.resolve(
      process.cwd(),
      "src/components/dashboard/dashboard-shell.tsx"
    );
    const source = readFileSync(shellPath, "utf8");
    expect(source.startsWith('"use client";')).toBe(true);
  });
});