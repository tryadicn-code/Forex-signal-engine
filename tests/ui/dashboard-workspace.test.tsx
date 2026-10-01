import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { failureResult, type SymbolScanResult } from "@/scanner/scanner-result";
import type { SignalView } from "@/scanner/scanner-api";
import type { DashboardData } from "@/types/dashboard";

vi.mock("@/components/signals/price-chart", () => ({
  PriceChart: ({ symbol }: { symbol: string }) => (
    <div aria-label={"Price chart for " + symbol} />
  ),
}));

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function analysed(
  symbol: string,
  overrides: Partial<SymbolScanResult> = {}
): SymbolScanResult {
  return {
    ...failureResult(symbol, "ANALYSED", "Analysed successfully.", T0),
    status: "ANALYSED",
    latestPrice: symbol.endsWith("JPY") ? 156.25 : 1.085,
    spreadPips: 1.2,
    regime: "TREND_UP",
    bias: "LONG",
    biasScore: 58,
    biasDirection: "LONG",
    setupState: "ARMED",
    setupScore: 74,
    triggerState: "WAITING",
    triggerScore: 50,
    triggerAgeInBars: 1,
    riskReward: 2.2,
    positionSize: 0.4,
    executionDecision: "WAIT",
    signalState: "ARMED",
    signalId: "sig-" + symbol.toLowerCase(),
    freshness: "FRESH",
    updatedAt: T0,
    timeframes: [
      { role: "macro", timeframe: "D1", asOf: T0, freshness: "FRESH", closedCandles: 220 },
      { role: "bias", timeframe: "H4", asOf: T0, freshness: "FRESH", closedCandles: 220 },
      { role: "setup", timeframe: "H1", asOf: T0, freshness: "FRESH", closedCandles: 220 },
      { role: "trigger", timeframe: "M15", asOf: T0, freshness: "FRESH", closedCandles: 220 },
    ],
    executionDetail: {
      decision: "WAIT",
      conditions: [
        { name: "RR_MINIMUM", passed: true, detail: "R:R meets configured minimum." },
      ],
      triggeredVetoes: [],
      reasons: ["Waiting for trigger confirmation."],
    },
    riskDetail: {
      approved: true,
      rejectionReason: null,
      stopDistancePips: 18,
      takeProfit1: 1.09,
      takeProfit2: 1.095,
    },
    evidence: [
      {
        code: "H4_STRUCTURE",
        label: "Bullish H4 structure",
        description: "Higher-timeframe structure supports the long bias.",
        weight: 30,
      },
    ],
    conflicts: [
      {
        code: "MOMENTUM_SOFT",
        label: "Momentum softening",
        description: "Momentum is weaker than the structural case.",
        weight: 10,
      },
    ],
    ...overrides,
  };
}

function signal(result: SymbolScanResult): SignalView {
  return {
    signalId: result.signalId ?? "sig-" + result.symbol.toLowerCase(),
    symbol: result.symbol,
    direction: result.biasDirection ?? "NEUTRAL",
    originTimeframe: "H1",
    originTimestamp: T0 - 60 * 60 * 1000,
    state: result.signalState ?? "WATCH",
    createdAt: T0 - 30 * 60 * 1000,
    updatedAt: T0,
    setupOriginTimestamp: T0 - 60 * 60 * 1000,
    triggerOriginTimestamp: null,
    transitionCount: 1,
  };
}

function dashboard(results: SymbolScanResult[]): DashboardData {
  const signals = results
    .filter((row) => row.signalId && row.signalState)
    .map(signal);

  const signalHistory = Object.fromEntries(
    signals.map((item) => [
      item.signalId,
      [
        {
          signalId: item.signalId,
          symbol: item.symbol,
          previousState: "WATCH" as const,
          newState: item.state,
          timestamp: T0,
          reason: "Engine state advanced.",
        },
      ],
    ])
  );

  return {
    snapshot: {
      startedAt: T0,
      completedAt: T0,
      durationMs: 18,
      symbolsRequested: results.length,
      symbolsSuccessful: results.filter((row) => row.status === "ANALYSED").length,
      symbolsFailed: results.filter((row) => row.status !== "ANALYSED").length,
      results,
      providerStatus: {
        state: results.some((row) => row.status !== "ANALYSED")
          ? "DEGRADED"
          : "CONNECTED",
        lastSuccessAt: T0,
        lastFailureAt: null,
        errorCount: results.filter((row) => row.status !== "ANALYSED").length,
        latencyMs: 12,
      },
      freshnessSummary: {
        FRESH: results.filter((row) => row.freshness === "FRESH").length,
        DELAYED: results.filter((row) => row.freshness === "DELAYED").length,
        STALE: results.filter((row) => row.freshness === "STALE").length,
      },
    },
    health: {
      lastScanStartedAt: T0,
      lastScanCompletedAt: T0,
      durationMs: 18,
      symbolsRequested: results.length,
      symbolsSuccessful: results.filter((row) => row.status === "ANALYSED").length,
      symbolsFailed: results.filter((row) => row.status !== "ANALYSED").length,
      providerStatus: {
        state: results.some((row) => row.status !== "ANALYSED")
          ? "DEGRADED"
          : "CONNECTED",
        lastSuccessAt: T0,
        lastFailureAt: null,
        errorCount: results.filter((row) => row.status !== "ANALYSED").length,
        latencyMs: 12,
      },
      freshnessSummary: {
        FRESH: results.filter((row) => row.freshness === "FRESH").length,
        DELAYED: results.filter((row) => row.freshness === "DELAYED").length,
        STALE: results.filter((row) => row.freshness === "STALE").length,
      },
      activeSignals: signals.length,
    },
    activeSignals: signals,
    allSignals: signals,
    recentTransitions: Object.values(signalHistory).flat(),
    signalHistory,
    scanError: null,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Phase 10.5 trading workstation dashboard", () => {
  it("renders analysed, stale, blocked, and failed symbols without collapsing the scanner", () => {
    const rows = [
      analysed("EURUSD"),
      analysed("GBPUSD", {
        executionDecision: "BLOCKED",
        signalState: "BLOCKED",
        executionDetail: {
          decision: "BLOCKED",
          conditions: [
            { name: "SPREAD", passed: false, detail: "Spread exceeded the limit." },
          ],
          triggeredVetoes: ["SPREAD_TOO_WIDE"],
          reasons: ["Hard veto fired."],
        },
      }),
      analysed("USDCHF", { freshness: "STALE" }),
      failureResult(
        "GBPAUD",
        "PROVIDER_FAILURE",
        "Provider unavailable.",
        T0,
        ["feed down"]
      ),
    ];

    render(<DashboardWorkspace initialData={dashboard(rows)} />);

    expect(screen.getAllByText("EURUSD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("STALE").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Engine status PROVIDER FAILURE/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("4 shown").length).toBeGreaterThan(0);
  });

  it("opens the signal detail from a mobile scanner action and can close it", () => {
    render(<DashboardWorkspace initialData={dashboard([analysed("EURUSD")])} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open signal detail for EURUSD" })
    );

    const detail = screen.getByRole("complementary", {
      name: "Signal detail for EURUSD",
    });
    expect(detail).toBeInTheDocument();
    expect(within(detail).getByText("Multi-timeframe context")).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "Close signal detail" }));
    expect(
      screen.queryByRole("complementary", { name: "Signal detail for EURUSD" })
    ).not.toBeInTheDocument();
  });

  it("opens signal detail when Paper Portfolio requests analysis for an open position", () => {
    render(
      <DashboardWorkspace
        initialData={dashboard([analysed("EURUSD"), analysed("GBPUSD")])}
      />
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("fse:open-signal-detail", {
          detail: { symbol: "GBPUSD" },
        })
      );
    });

    expect(
      screen.getByRole("complementary", {
        name: "Signal detail for GBPUSD",
      })
    ).toBeInTheDocument();
  });

  it("renders engine evidence, conflicts, and lifecycle without generating new analysis", () => {
    render(<DashboardWorkspace initialData={dashboard([analysed("EURUSD")])} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open signal detail for EURUSD" })
    );

    const detail = screen.getByRole("complementary", {
      name: "Signal detail for EURUSD",
    });
    expect(within(detail).getByText("Bullish H4 structure")).toBeInTheDocument();
    expect(within(detail).getByText("Momentum softening")).toBeInTheDocument();
    expect(within(detail).getAllByText("ARMED").length).toBeGreaterThan(0);
    expect(within(detail).getByText("Engine state advanced.")).toBeInTheDocument();
  });

  it("renders hard vetoes and block reasons from the execution engine", () => {
    const blocked = analysed("GBPUSD", {
      executionDecision: "BLOCKED",
      signalState: "BLOCKED",
      executionDetail: {
        decision: "BLOCKED",
        conditions: [
          { name: "SPREAD", passed: false, detail: "Spread exceeded the limit." },
        ],
        triggeredVetoes: ["SPREAD_TOO_WIDE"],
        reasons: ["Hard veto fired."],
      },
    });

    render(<DashboardWorkspace initialData={dashboard([blocked])} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open signal detail for GBPUSD" })
    );

    const detail = screen.getByRole("complementary", {
      name: "Signal detail for GBPUSD",
    });
    expect(within(detail).getAllByText(/SPREAD_TOO_WIDE/).length).toBeGreaterThan(0);
    expect(within(detail).getByText("Spread exceeded the limit.")).toBeInTheDocument();
  });

  it("applies search filters and reports the visible result count", () => {
    render(
      <DashboardWorkspace
        initialData={dashboard([analysed("EURUSD"), analysed("GBPUSD")])}
      />
    );

    fireEvent.change(screen.getAllByLabelText("Search symbols")[0], {
      target: { value: "GBP" },
    });

    expect(screen.getAllByText("1 shown").length).toBeGreaterThan(0);
    expect(screen.getAllByText("GBPUSD").length).toBeGreaterThan(0);
  });

  it("shows an explicit empty state when a scan returns no symbols", () => {
    render(<DashboardWorkspace initialData={dashboard([])} />);

    expect(screen.getByText("No symbols scanned")).toBeInTheDocument();
  });

  it("keeps a healthy ACTIVE strategy out of the primary trading hierarchy", () => {
    const data = dashboard([analysed("EURUSD")]);
    data.releaseRuntime = {
      status: "ACTIVE",
      reason: "ACTIVE_RELEASE",
      canScan: true,
      version: "v1.0.0",
      title: "Validated baseline",
      manifestFingerprint: "abcdef1234567890",
      sourceReportId: "report-1",
      activationAt: T0 - 1000,
      registryUpdatedAt: T0,
      resolvedAt: T0,
      pinned: true,
      defaultDrift: true,
      driftAreas: ["engineConfig"],
      message: "ACTIVE release is pinned.",
    };

    render(<DashboardWorkspace initialData={data} />);

    expect(screen.queryByText("Strategy runtime")).not.toBeInTheDocument();
    expect(screen.queryByText("Strategy needs attention.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Market overview")).toBeInTheDocument();
  });

  it("surfaces a scan-level error instead of silently clearing the dashboard", () => {
    const data = dashboard([analysed("EURUSD")]);
    data.scanError = "calendar dependency failed";

    render(<DashboardWorkspace initialData={data} />);

    expect(screen.getByRole("alert")).toHaveTextContent("calendar dependency failed");
    expect(screen.getAllByText("EURUSD").length).toBeGreaterThan(0);
  });

  it("derives the auto-sync countdown from the last completed scan when nextScanAt is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 30_000);

    const data = dashboard([analysed("EURUSD")]);
    data.automation = {
      enabled: true,
      scanIntervalMs: 60_000,
      dashboardSyncIntervalMs: 15_000,
      nextScanAt: null,
    };

    render(<DashboardWorkspace initialData={data} />);

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByText("30s")).toBeInTheDocument();
  });

  it("does not start a POST scan from the browser when auto-sync reaches zero", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const data = dashboard([analysed("EURUSD")]);
    data.automation = {
      enabled: true,
      scanIntervalMs: 60_000,
      dashboardSyncIntervalMs: 15_000,
      nextScanAt: T0,
    };

    render(<DashboardWorkspace initialData={data} />);

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recovers with a read-only GET when manual refresh loses the browser connection", async () => {
    const next = dashboard([
      analysed("NZDUSD", { bias: "NEUTRAL", biasDirection: "NEUTRAL" }),
    ]);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => next,
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<DashboardWorkspace initialData={dashboard([analysed("EURUSD")])} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh scan" }));

    await waitFor(() => {
      expect(screen.getAllByText("NZDUSD").length).toBeGreaterThan(0);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("GET");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refreshes through the scanner API and replaces the view model", async () => {
    const next = dashboard([analysed("NZDUSD", { bias: "NEUTRAL", biasDirection: "NEUTRAL" })]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => next,
      })
    );

    render(<DashboardWorkspace initialData={dashboard([analysed("EURUSD")])} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh scan" }));

    await waitFor(() => {
      expect(screen.getAllByText("NZDUSD").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("EURUSD")).not.toBeInTheDocument();
  });
});
