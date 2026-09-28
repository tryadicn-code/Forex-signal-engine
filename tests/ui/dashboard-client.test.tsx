import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import type { DashboardData } from "@/types/dashboard";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function payload(): DashboardData {
  return {
    snapshot: {
      startedAt: T0,
      completedAt: T0,
      durationMs: 12,
      symbolsRequested: 0,
      symbolsSuccessful: 0,
      symbolsFailed: 0,
      results: [],
      providerStatus: {
        state: "CONNECTED",
        lastSuccessAt: T0,
        lastFailureAt: null,
        errorCount: 0,
        latencyMs: 2,
      },
      freshnessSummary: { FRESH: 0, DELAYED: 0, STALE: 0 },
    },
    health: {
      lastScanStartedAt: T0,
      lastScanCompletedAt: T0,
      durationMs: 12,
      symbolsRequested: 0,
      symbolsSuccessful: 0,
      symbolsFailed: 0,
      providerStatus: {
        state: "CONNECTED",
        lastSuccessAt: T0,
        lastFailureAt: null,
        errorCount: 0,
        latencyMs: 2,
      },
      freshnessSummary: { FRESH: 0, DELAYED: 0, STALE: 0 },
      activeSignals: 0,
    },
    activeSignals: [],
    allSignals: [],
    recentTransitions: [],
    signalHistory: {},
    scanError: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardClient bootstrap", () => {
  it("starts from deterministic client loading markup then fetches dashboard data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload(),
      })
    );

    render(<DashboardClient />);

    expect(
      screen.getByLabelText("Loading interactive signal dashboard")
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("No symbols scanned")).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith("/api/scanner", {
      method: "GET",
      cache: "no-store",
    });
  });
});
