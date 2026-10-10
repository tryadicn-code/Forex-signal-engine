import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarketHealthPanel } from "@/components/dashboard/market-health-panel";
import {
  failureResult,
  type ScannerHealth,
  type ScannerSnapshot,
} from "@/scanner/scanner-result";

vi.mock("@/lib/format", async () => {
  const actual = await vi.importActual<typeof import("@/lib/format")>("@/lib/format");
  return {
    ...actual,
    formatTime: (v: number | null | undefined) => (v ? "T" + v : "n/a"),
    formatDuration: (v: number | null | undefined) => (v ? v + "ms" : "n/a"),
  };
});

function snapshot(overrides: Partial<ScannerSnapshot> = {}): ScannerSnapshot {
  return {
    startedAt: 0,
    completedAt: 1000,
    durationMs: 1000,
    symbolsRequested: 2,
    symbolsSuccessful: 1,
    symbolsFailed: 1,
    results: [],
    providerStatus: null,
    freshnessSummary: { FRESH: 1, DELAYED: 1, STALE: 0 },
    ...overrides,
  };
}

function health(overrides: Partial<ScannerHealth> = {}): ScannerHealth {
  return {
    lastScanStartedAt: 0,
    lastScanCompletedAt: 5000,
    durationMs: 1500,
    symbolsRequested: 2,
    symbolsSuccessful: 1,
    symbolsFailed: 1,
    providerStatus: null,
    freshnessSummary: { FRESH: 0, DELAYED: 0, STALE: 0 },
    activeSignals: 0,
    ...overrides,
  };
}

describe("MarketHealthPanel", () => {
  it("renders with null snapshot and null health without crashing", () => {
    render(<MarketHealthPanel snapshot={null} health={null} />);
    expect(
      screen.getByRole("heading", { name: /Market data health/i })
    ).toBeInTheDocument();
  });

  it("renders freshness counts from snapshot.freshnessSummary", () => {
    render(
      <MarketHealthPanel
        snapshot={snapshot({ freshnessSummary: { FRESH: 5, DELAYED: 2, STALE: 3 } })}
        health={health()}
      />
    );

    // FreshnessCount renders label + count side-by-side. Assert each count
    // appears (they are rendered as text nodes with the badge label).
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("lists failed symbols when results contain non-analysed entries", () => {
    render(
      <MarketHealthPanel
        snapshot={snapshot({
          results: [
            failureResult("EURUSD", "PROVIDER_FAILURE", "no data", 0),
            failureResult("GBPUSD", "PROVIDER_FAILURE", "no data", 0),
          ],
        })}
        health={health()}
      />
    );

    expect(screen.getByText("Isolated failures")).toBeInTheDocument();
    expect(screen.getByText("EURUSD, GBPUSD")).toBeInTheDocument();
  });

  it("omits the isolated failures block when all symbols are analysed", () => {
    render(
      <MarketHealthPanel
        snapshot={snapshot({
          results: [
            {
              ...failureResult("EURUSD", "ANALYSED", "ok", 0),
            },
          ],
        })}
        health={health()}
      />
    );

    expect(screen.queryByText("Isolated failures")).not.toBeInTheDocument();
  });

  it("renders symbol isolation metric when health is present", () => {
    render(
      <MarketHealthPanel
        snapshot={snapshot()}
        health={health({ symbolsSuccessful: 8, symbolsFailed: 2 })}
      />
    );

    // Rendered twice (desktop grid + mobile details), so use getAllByText.
    expect(screen.getAllByText("8 ok / 2 failed").length).toBeGreaterThan(0);
  });

  it("falls back to NOT_AVAILABLE when health is null", () => {
    render(<MarketHealthPanel snapshot={snapshot()} health={null} />);
    // Multiple NOT_AVAILABLE placeholders expected (latency + isolation).
    expect(screen.getAllByText(/n\/a|—/).length).toBeGreaterThan(0);
  });
});