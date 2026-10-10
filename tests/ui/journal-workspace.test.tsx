import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JournalWorkspace } from "@/components/paper/journal-workspace";
import type {
  PaperDashboardData,
  PaperPosition,
  PaperTrade,
} from "@/paper/types";

// ---- mocks --------------------------------------------------------------

const mockApiFetch = vi.fn();
const mockDownloadCsv = vi.fn();
const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: vi.fn() }),
}));

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
  mockRouterPush.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JournalWorkspace", () => {
  it("renders the header and subtitle", () => {
    render(<JournalWorkspace initialPaper={makePaper()} />);
    expect(screen.getByText("Trading journal")).toBeInTheDocument();
    expect(
      screen.getByText(/Review closed paper trades, performance metrics/i)
    ).toBeInTheDocument();
  });

  it("renders both Portfolio and Journal tabs with Journal selected", () => {
    render(<JournalWorkspace initialPaper={makePaper()} />);
    const portfolioTab = screen.getByRole("tab", { name: "Portfolio" });
    const journalTab = screen.getByRole("tab", { name: "Journal" });
    expect(portfolioTab).toHaveAttribute("aria-selected", "false");
    expect(journalTab).toHaveAttribute("aria-selected", "true");
  });

  it("navigates to /portfolio when the Portfolio tab is clicked", () => {
    render(<JournalWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Portfolio" }));
    expect(mockRouterPush).toHaveBeenCalledWith("/portfolio");
  });

  it("navigates to /journal when the Journal tab is clicked", () => {
    render(<JournalWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Journal" }));
    expect(mockRouterPush).toHaveBeenCalledWith("/journal");
  });

  it("always passes view=journal to the panel", () => {
    render(<JournalWorkspace initialPaper={makePaper()} />);
    expect(screen.getByTestId("panel-stub").getAttribute("data-view")).toBe(
      "journal"
    );
  });

  it("hides the Export CSV button when there are no recent trades", () => {
    render(<JournalWorkspace initialPaper={makePaper()} />);
    expect(
      screen.queryByLabelText("Export closed paper trades as CSV")
    ).not.toBeInTheDocument();
  });

  it("shows the Export CSV button and calls downloadCsv when trades exist", () => {
    const paper = makePaper({ recentTrades: [makeTrade()] });
    render(<JournalWorkspace initialPaper={paper} />);
    const button = screen.getByLabelText("Export closed paper trades as CSV");
    fireEvent.click(button);
    expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
  });

  it("calls apiFetch with DELETE when reset is confirmed", async () => {
    mockApiFetch.mockResolvedValueOnce(makePaper());
    render(<JournalWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByTestId("stub-reset"));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe("/api/paper");
    expect(init).toMatchObject({ method: "DELETE", cache: "no-store" });
  });

  it("calls apiFetch with set-initial-balance body when balance is submitted", async () => {
    mockApiFetch.mockResolvedValueOnce(makePaper());
    render(<JournalWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByTestId("stub-balance"));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe("/api/paper");
    expect(init).toMatchObject({ method: "POST" });
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ action: "set-initial-balance", initialBalance: 5000 });
  });

  it("calls apiFetch with close-position body when close is confirmed", async () => {
    const paper = makePaper({ openPositions: [makePosition()] });
    mockApiFetch.mockResolvedValueOnce(makePaper());
    render(<JournalWorkspace initialPaper={paper} />);
    fireEvent.click(screen.getByTestId("stub-close"));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe("/api/paper");
    expect(init).toMatchObject({ method: "POST" });
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toEqual({ action: "close-position", positionId: "pos-1" });
  });

  it("shows an error banner when reset fails with UNAUTHORIZED", async () => {
    const { ApiError } = await import("@/lib/api-client");
    mockApiFetch.mockRejectedValueOnce(
      new ApiError("unauthorized", 401, "UNAUTHORIZED")
    );
    render(<JournalWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByTestId("stub-reset"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Approval secret is required to reset/i);
  });

  it("shows an error banner when set initial balance fails with UNAUTHORIZED", async () => {
    const { ApiError } = await import("@/lib/api-client");
    mockApiFetch.mockRejectedValueOnce(
      new ApiError("unauthorized", 401, "UNAUTHORIZED")
    );
    render(<JournalWorkspace initialPaper={makePaper()} />);
    fireEvent.click(screen.getByTestId("stub-balance"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Approval secret is required to change/i);
  });

  it("shows an error banner when close fails with UNAUTHORIZED", async () => {
    const { ApiError } = await import("@/lib/api-client");
    const paper = makePaper({ openPositions: [makePosition()] });
    mockApiFetch.mockRejectedValueOnce(
      new ApiError("unauthorized", 401, "UNAUTHORIZED")
    );
    render(<JournalWorkspace initialPaper={paper} />);
    fireEvent.click(screen.getByTestId("stub-close"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Approval secret is required to close/i);
  });
});