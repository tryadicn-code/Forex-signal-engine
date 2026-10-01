import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import type { NotificationDashboard } from "@/notifications/types";

function dashboard(): NotificationDashboard {
  return {
    protocol: "phase-11-alert-dashboard-v1",
    generatedAt: 1,
    enabled: true,
    channels: [
      {
        channel: "telegram",
        enabled: true,
        configured: true,
        message: "Telegram Bot API channel is configured.",
      },
      {
        channel: "whatsapp",
        enabled: false,
        configured: false,
        message: "WhatsApp channel is disabled.",
      },
    ],
    recentEvents: [
      {
        id: "alert-1",
        key: "key-1",
        signalId: "sig-1",
        symbol: "EURUSD",
        direction: "LONG",
        state: "NEAR_EXECUTE",
        detectedAt: 1,
        strategyVersion: "1.0.0",
        strategyActivationAt: 1,
        latestPrice: 1.1,
        biasScore: 80,
        setupScore: 85,
        triggerScore: 50,
        riskReward: null,
        entryPrice: null,
        stopLoss: null,
        takeProfit1: null,
        riskPercent: null,
        positionSize: null,
        freshness: "FRESH",
        waitingFor: ["TRIGGER_CONFIRMATION", "RISK_EVALUATION"],
        blockers: [],
        status: "SENT",
        channels: ["telegram"],
        sentChannels: ["telegram"],
        failedChannels: [],
        message: "FSE NEAR EXECUTE",
        updatedAt: 1,
      },
    ],
    pendingDeliveries: 0,
    failedDeliveries: 0,
    sentDeliveries: 1,
    nearExecuteThresholds: {
      biasScore: 60,
      setupScore: 70,
      triggerScore: 50,
      minRiskReward: 1.5,
    },
    cooldownMs: 300_000,
    error: null,
  };
}

describe("Phase 11 NotificationPanel", () => {
  it("renders channel readiness and recent near-execute alert", () => {
    render(<NotificationPanel notifications={dashboard()} />);

    expect(screen.getByText("Signal notification center")).toBeInTheDocument();
    expect(screen.getByText("TELEGRAM READY")).toBeInTheDocument();
    expect(screen.getByText("NEAR_EXECUTE")).toBeInTheDocument();
    expect(screen.getByText("EURUSD LONG")).toBeInTheDocument();
  });

  it("renders nothing when no dashboard payload is supplied", () => {
    const { container } = render(<NotificationPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});
