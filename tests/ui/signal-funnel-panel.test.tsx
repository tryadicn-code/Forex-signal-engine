import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SignalFunnelPanel } from "@/components/analytics/signal-funnel-panel";
import {
  SIGNAL_FUNNEL_STAGES,
  type SignalFunnelDashboard,
  type SignalFunnelWindow,
} from "@/analytics/signal-funnel";

function analytics(): SignalFunnelDashboard {
  return {
    asOf: 1_000,
    windows: {
      "24H": summary("24H", 10, 1),
      "7D": summary("7D", 70, 7),
      "30D": summary("30D", 300, 30),
    },
  };
}

function summary(
  window: SignalFunnelWindow,
  observations: number,
  executions: number
) {
  return {
    window,
    from: 0,
    to: 1_000,
    observations,
    executions,
    stageStats: SIGNAL_FUNNEL_STAGES.map((stage, index) => ({
      stage,
      count: Math.max(0, observations - index),
      conversionRate: index === 0 ? null : 90,
      dropOff: index === 0 ? 0 : 1,
    })),
    rejectionReasons: [
      {
        code: "SETUP_ZONE_TOO_FAR",
        stage: "SETUP_ACTIONABLE" as const,
        count: 3,
        percentage: 33.33,
      },
    ],
    regimeStats: [
      {
        regime: "TREND_UP",
        observations,
        executions,
        executionRate:
          observations === 0 ? 0 : Math.round((executions / observations) * 100),
      },
    ],
    strategyRoutingStats: [
      {
        preferredStrategyId: "BREAKOUT_RETEST",
        selectedStrategyId: "TREND_PULLBACK",
        routingMode: "COMPATIBILITY_FALLBACK",
        observations,
        executions,
        executionRate:
          observations === 0 ? 0 : Math.round((executions / observations) * 100),
      },
    ],
  };
}

describe("Phase 12 SignalFunnelPanel", () => {
  it("renders funnel metrics and rejection diagnostics", () => {
    render(<SignalFunnelPanel analytics={analytics()} />);

    expect(
      screen.getByText("Signal Funnel + Rejection Analytics")
    ).toBeInTheDocument();
    expect(screen.getByText("SETUP_ZONE_TOO_FAR")).toBeInTheDocument();
    expect(screen.getAllByText("10").length).toBeGreaterThan(0);
  });

  it("renders preferred-to-active strategy routing", () => {
    render(<SignalFunnelPanel analytics={analytics()} />);

    expect(
      screen.getByText("BREAKOUT_RETEST → TREND_PULLBACK")
    ).toBeInTheDocument();
    expect(screen.getByText(/COMPATIBILITY_FALLBACK/)).toBeInTheDocument();
  });

  it("switches rolling windows without rescanning", () => {
    render(<SignalFunnelPanel analytics={analytics()} />);

    fireEvent.click(screen.getByRole("button", { name: "7D" }));

    expect(screen.getAllByText("70").length).toBeGreaterThan(0);
  });

  it("surfaces persistence warnings but still renders analytics", () => {
    render(
      <SignalFunnelPanel
        analytics={analytics()}
        persistenceError="disk unavailable"
      />
    );

    expect(
      screen.getByText("Analytics persistence warning: disk unavailable")
    ).toBeInTheDocument();
    expect(screen.getByText("SETUP_ZONE_TOO_FAR")).toBeInTheDocument();
  });
});
