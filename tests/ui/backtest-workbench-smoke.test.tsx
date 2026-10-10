import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RobustnessWorkbench } from "@/components/backtest/robustness-workbench";
import { StatisticalDiagnosticsWorkbench } from "@/components/backtest/statistical-diagnostics-workbench";
import { ReleaseGateWorkbench } from "@/components/backtest/release-gate-workbench";
import { StrategyVersionRegistryWorkbench } from "@/components/backtest/strategy-version-registry-workbench";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(() => new Promise(() => {})),
  ApiError: class ApiError extends Error {
    constructor(message: string, public readonly code: string) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

const T0 = Date.UTC(2026, 0, 1);

function makeArtifact(): BacktestRunArtifact {
  return {
    schemaVersion: 1,
    id: "smoke-test",
    createdAt: T0,
    completedAt: T0 + 60_000,
    durationMs: 60_000,
    config: {
      datasetId: "smoke",
      source: "synthetic",
      sourceUtcOffsetMinutes: 0,
      assumedSpreadPips: 1,
      startAt: T0,
      endAt: T0 + 86_400_000,
      initialBalance: 10_000,
      riskPercent: 0.5,
      intrabarConflictPolicy: "STOP_FIRST",
      maxOpenPositions: 10,
      maxTotalOpenRiskPercent: 5,
      maxReplaySteps: 50_000,
    },
    validation: {
      valid: true,
      datasetId: "smoke",
      source: "synthetic",
      sourceUtcOffsetMinutes: 0,
      assumedSpreadPips: 1,
      importedFileCount: 0,
      importedSymbolCount: 0,
      importedSeriesCount: 0,
      files: [],
      series: [],
      symbols: [],
      commonStartAt: T0,
      commonEndAt: T0 + 86_400_000,
      estimatedM15Steps: 0,
      issues: [],
    },
    execution: {
      enabled: true,
      executionTimeframe: "M15",
      intrabarConflictPolicy: "STOP_FIRST",
      initialBalance: 10_000,
      balance: 10_000,
      equity: 10_000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      openRiskAmount: 0,
      openRiskPercent: 0,
      orderCount: 0,
      openPositionCount: 0,
      closedTradeCount: 0,
      orders: [],
      openPositions: [],
      trades: [],
      equityCurve: [],
    },
    analytics: {
      sampleSize: 0,
      wins: 0,
      losses: 0,
      breakEven: 0,
      winRate: null,
      lossRate: null,
      initialBalance: 10_000,
      finalBalance: 10_000,
      netPnL: 0,
      netReturnPercent: 0,
      grossProfit: 0,
      grossLoss: 0,
      averageWin: null,
      averageLoss: null,
      payoffRatio: null,
      profitFactor: null,
      expectancyAmount: 0,
      netR: 0,
      averageR: null,
      medianR: null,
      standardDeviationR: null,
      expectancyR: null,
      bestTradePnL: null,
      worstTradePnL: null,
      bestTradeR: null,
      worstTradeR: null,
      averageHoldingTimeMs: null,
      medianHoldingTimeMs: null,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      maxEquityDrawdownAmount: 0,
      maxEquityDrawdownPercent: 0,
      maxEquityDrawdownAt: null,
      currentEquityDrawdownAmount: 0,
      currentEquityDrawdownPercent: 0,
      maxBalanceDrawdownAmount: 0,
      maxBalanceDrawdownPercent: 0,
      maxBalanceDrawdownAt: null,
      equityCurve: [],
      rDistribution: [],
      segments: {
        byStrategy: [],
        bySymbol: [],
        byDirection: [],
        byBias: [],
        bySetupScore: [],
        byEntrySession: [],
        byCloseReason: [],
      },
    },
  };
}

describe("backtest sibling workbench smoke", () => {
  it("RobustnessWorkbench renders header and temporal holdout", () => {
    render(<RobustnessWorkbench artifact={makeArtifact()} />);
    expect(screen.getByText("Robustness & out-of-sample")).toBeInTheDocument();
  });

  it("StatisticalDiagnosticsWorkbench renders header", () => {
    render(<StatisticalDiagnosticsWorkbench artifact={makeArtifact()} />);
    expect(screen.getByText("Statistical diagnostics")).toBeInTheDocument();
  });

  it("ReleaseGateWorkbench renders header", () => {
    render(
      <ReleaseGateWorkbench
        artifact={makeArtifact()}
        forwardComparison={null}
        onArtifactUpdated={() => {}}
        onRecentRunsRefresh={async () => {}}
      />
    );
    expect(
      screen.getByText("Validation evidence & release gate")
    ).toBeInTheDocument();
  });

  it("StrategyVersionRegistryWorkbench renders header", () => {
    render(<StrategyVersionRegistryWorkbench artifact={makeArtifact()} />);
    expect(screen.getByText("Strategy version registry")).toBeInTheDocument();
  });
});