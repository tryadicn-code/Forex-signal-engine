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
    failureCategoryStats: [],
    downstream: {
      paperFilled: 0,
      paperRejected: 0,
      paperRejectionReasons: [],
      brokerPending: 0,
      brokerRejected: 0,
      brokerUnavailable: true,
    },
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

describe("TRD-017 downstream execution panel section", () => {
  it("renders downstream counters and paper rejection reasons", async () => {
    const { render, screen } = await import("@testing-library/react");
    const { SignalFunnelPanel } = await import(
      "@/components/analytics/signal-funnel-panel"
    );
    const { SIGNAL_FUNNEL_STAGES } = await import("@/analytics/signal-funnel");

    const dashboard = {
      asOf: 1000,
      windows: {
        "24H": {
          window: "24H" as const,
          from: 0,
          to: 1000,
          observations: 10,
          executions: 1,
          stageStats: SIGNAL_FUNNEL_STAGES.map((stage, index) => ({
            stage,
            count: Math.max(0, 10 - index),
            conversionRate: index === 0 ? null : 90,
            dropOff: index === 0 ? 0 : 1,
          })),
          rejectionReasons: [],
          failureCategoryStats: [],
          strategyRoutingStats: [],
          regimeStats: [],
          downstream: {
            paperFilled: 2,
            paperRejected: 3,
            paperRejectionReasons: [
              { code: "PAPER_MARKET_DATA_NOT_FRESH", count: 2 },
              { code: "PAPER_MAX_OPEN_POSITIONS", count: 1 },
            ],
            brokerPending: 0,
            brokerRejected: 0,
            brokerUnavailable: true,
          },
        },
        "7D": {
          window: "7D" as const,
          from: 0,
          to: 1000,
          observations: 70,
          executions: 7,
          stageStats: SIGNAL_FUNNEL_STAGES.map((stage, index) => ({
            stage,
            count: Math.max(0, 70 - index),
            conversionRate: index === 0 ? null : 90,
            dropOff: index === 0 ? 0 : 1,
          })),
          rejectionReasons: [],
          failureCategoryStats: [],
          strategyRoutingStats: [],
          regimeStats: [],
          downstream: {
            paperFilled: 0,
            paperRejected: 0,
            paperRejectionReasons: [],
            brokerPending: 0,
            brokerRejected: 0,
            brokerUnavailable: true,
          },
        },
        "30D": {
          window: "30D" as const,
          from: 0,
          to: 1000,
          observations: 300,
          executions: 30,
          stageStats: SIGNAL_FUNNEL_STAGES.map((stage, index) => ({
            stage,
            count: Math.max(0, 300 - index),
            conversionRate: index === 0 ? null : 90,
            dropOff: index === 0 ? 0 : 1,
          })),
          rejectionReasons: [],
          failureCategoryStats: [],
          strategyRoutingStats: [],
          regimeStats: [],
          downstream: {
            paperFilled: 0,
            paperRejected: 0,
            paperRejectionReasons: [],
            brokerPending: 0,
            brokerRejected: 0,
            brokerUnavailable: true,
          },
        },
      },
    };

    render(<SignalFunnelPanel analytics={dashboard} />);

    expect(screen.getByText("Downstream execution")).toBeInTheDocument();
    expect(screen.getByText("Paper filled")).toBeInTheDocument();
    expect(screen.getByText("Paper rejected")).toBeInTheDocument();
    expect(screen.getByText("PAPER_MARKET_DATA_NOT_FRESH")).toBeInTheDocument();
    expect(screen.getByText("PAPER_MAX_OPEN_POSITIONS")).toBeInTheDocument();
  });
});
