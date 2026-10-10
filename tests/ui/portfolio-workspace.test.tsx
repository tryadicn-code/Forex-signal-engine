import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioWorkspace } from "@/components/paper/portfolio-workspace";
import type {
  PaperDashboardData,
  PaperPosition,
  PaperTrade,
} from "@/paper/types";

// ---- mocks --------------------------------------------------------------

const mockApiFetch = vi.fn();
const mockDownloadCsv = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code: string,
      public readonly body: unknown = null
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

vi.mock("@/components/paper/paper-trading-panel", () => ({
  PaperTradingPanel: ({
    view,
    resetting,
    onReset,
    onClosePosition,
    onSetInitialBalance,
  }: {
    view: string;
    resetting: boolean;
    onReset: () => void;
    onClosePosition: (id: string) => void;
    onSetInitialBalance: (n: number) => void;
  }) => (
    <div data-testid="panel-stub" data-view={view} data-resetting={String(resetting)}>
      <button data-testid="stub-reset" onClick={onReset} />
      <button data-testid="stub-close" onClick={() => onClosePosition("pos-1")} />
      <button data-testid="stub-balance" onClick={() => onSetInitialBalance(5000)} />
    </div>
  ),
  csvFilename: () => "paper-trades-test.csv",
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
  tradesToCsv: () => "id,symbol\n1,EURUSD",
}));

// ---- fixtures -----------------------------------------------------------

function makeEngine() {
  return {
    bias: null,
    setupScore: null,
    executionDecision: null,
    freshness: null,
    engineVersion: "v0",
    paperConfigVersion: "v0",
  };
}

function makePosition(overrides: Partial<PaperPosition> = {}): PaperPosition {
  return {
    id: "pos-1",
    orderId: "ord-1",
    signalId: "sig-1",
    symbol: "EURUSD",
    side: "LONG",
    entryPrice: 1.1,
    currentPrice: 1.11,
    stopLoss: 1.09,
    takeProfit: 1.12,
    positionSize: 0.1,
    pipSize: 0.0001,
    pipValuePerLotAccountCurrency: 10,
    riskAmount: 50,
    riskPercent: 0.5,
    plannedRR: 2,
    openedAt: 0,
    updatedAt: 0,
    lastEvaluatedCandleTimestamp: null,
    status: "OPEN",
    unrealizedPnL: 10,
    currentR: 0.2,
    engine: makeEngine(),
    ...overrides,
  };
}

function makeTrade(overrides: Partial<PaperTrade> = {}): PaperTrade {
  return {
    id: "trade-1",
    orderId: "ord-1",
    positionId: "pos-1",
    signalId: "sig-1",
    symbol: "EURUSD",
    side: "LONG",
    entryPrice: 1.1,
    exitPrice: 1.12,
    stopLoss: 1.09,
    takeProfit: 1.12,
    positionSize: 0.1,
    riskAmount: 50,
    riskPercent: 0.5,
    plannedRR: 2,
    realizedPnL: 100,
    realizedPnLPercent: 1,
    realizedR: 2,
    openedAt: 0,
    closedAt: 1000,
    holdingDurationMs: 1000,
    closeReason: "TAKE_PROFIT",
    engine: makeEngine(),
    ...overrides,
  };
}

function makePaper(
  overrides: Partial<PaperDashboardData> = {}
): PaperDashboardData {
  return {
    enabled: true,
    config: {
      maxOpenPositions: 10,
      maxTotalOpenRiskPercent: 5,
      maxOpenPositionsPerSymbol: 1,
      maxDirectionalCurrencyExposure: 5,
      stopLossReentryCooldownMs: 0,
      intrabarConflictPolicy: "STOP_FIRST",
    },
    account: {
      currency: "USD",
      initialBalance: 10000,
      balance: 10000,
      equity: 10000,
      realizedPnL: 0,
      unrealizedPnL: 0,
      openRiskAmount: 0,
      openRiskPercent: 0,
      openPositionCount: 0,
      closedTradeCount: 0,
    },
    openPositions: [],
    recentTrades: [],
    recentOrders: [],
    performance: {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakEven: 0,
      winRate: null,
      lossRate: null,
      grossProfit: 0,
      grossLoss: 0,
      netPnL: 0,
      averageWin: null,
      averageLoss: null,
      averageR: null,
      medianR: null,
      profitFactor: null,
      expectancy: null,
      expectancyR: null,
      maxDrawdownAmount: 0,
      maxDrawdownPercent: 0,
      currentDrawdownAmount: 0,
      currentDrawdownPercent: 0,
      bestTrade: null,
      worstTrade: null,
      averageHoldingTimeMs: null,
      consecutiveWins: 0,
      consecutiveLosses: 0,
    },
    persistenceError: null,
    ...overrides,
  };
}

// ---- tests --------------------------------------------------------------

beforeEach(() => {
  mockApiFetch.mockReset();
  mockDownloadCsv.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PortfolioWorkspace", () => {
  it("renders the header and subtitle", () => {
    render(<PortfolioWorkspace initialPaper={makePaper()} />);
    expect(screen.getByText("Paper portfolio")).toBeInTheDocument();
    expect(
      screen.getByText(/Review paper positions, orders, and account balance/i)
    ).toBeInTheDocument();
  });

  it("renders both Portfolio and Journal tabs", () => {
    render(<PortfolioWorkspace initialPaper={makePaper()} />);
    expect(screen.getByRole("tab", { name: "Portfolio" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Journal" })).toBeInTheDocument();
  });

  it("defaults to the portfolio view", () => {
    render(<PortfolioWorkspace initialPaper={makePaper()} />);
    const stub = screen.getByTestId("panel-stub");
    expect(stub.getAttribute("data-view")).toBe("portfolio");
  });

  it("switches to the journal view when the Journal tab is clicked", () => {
    render(<PortfolioWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Journal" }));
    expect(screen.getByTestId("panel-stub").getAttribute("data-view")).toBe(
      "journal"
    );
  });

  it("switches back to the portfolio view when the Portfolio tab is clicked", () => {
    render(<PortfolioWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Journal" }));
    fireEvent.click(screen.getByRole("tab", { name: "Portfolio" }));
    expect(screen.getByTestId("panel-stub").getAttribute("data-view")).toBe(
      "portfolio"
    );
  });

  it("hides the Export CSV button when there are no recent trades", () => {
    render(<PortfolioWorkspace initialPaper={makePaper()} />);
    expect(
      screen.queryByLabelText("Export closed paper trades as CSV")
    ).not.toBeInTheDocument();
  });

  it("shows the Export CSV button and calls downloadCsv when trades exist", () => {
    const paper = makePaper({ recentTrades: [makeTrade()] });
    render(<PortfolioWorkspace initialPaper={paper} />);
    const button = screen.getByLabelText("Export closed paper trades as CSV");
    fireEvent.click(button);
    expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
  });

  it("calls apiFetch with DELETE when reset is confirmed", async () => {
    const next = makePaper({ account: { ...makePaper().account, balance: 9000 } });
    mockApiFetch.mockResolvedValueOnce(next);

    render(<PortfolioWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByTestId("stub-reset"));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe("/api/paper");
    expect(init).toMatchObject({ method: "DELETE", cache: "no-store" });
  });

  it("shows an error banner when reset fails with UNAUTHORIZED", async () => {
    const { ApiError } = await import("@/lib/api-client");
    mockApiFetch.mockRejectedValueOnce(
      new ApiError("unauthorized", 401, "UNAUTHORIZED")
    );

    render(<PortfolioWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByTestId("stub-reset"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Approval secret is required to reset/i);
  });

  it("calls apiFetch with close-position body when close is confirmed", async () => {
    const paper = makePaper({ openPositions: [makePosition()] });
    mockApiFetch.mockResolvedValueOnce(makePaper());

    render(<PortfolioWorkspace initialPaper={paper} />);
    fireEvent.click(screen.getByTestId("stub-close"));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe("/api/paper");
    expect(init).toMatchObject({ method: "POST" });
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ action: "close-position", positionId: "pos-1" });
  });

  it("shows an error banner when close fails with UNAUTHORIZED", async () => {
    const { ApiError } = await import("@/lib/api-client");
    const paper = makePaper({ openPositions: [makePosition()] });
    mockApiFetch.mockRejectedValueOnce(
      new ApiError("unauthorized", 401, "UNAUTHORIZED")
    );

    render(<PortfolioWorkspace initialPaper={paper} />);
    fireEvent.click(screen.getByTestId("stub-close"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Approval secret is required to close/i);
  });
});