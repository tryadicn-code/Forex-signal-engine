import { describe, expect, it } from "vitest";
import { HistoricalExecutionSimulator } from "@/replay/historical-execution-simulator";
import type { ReplayDataset, ReplayStep } from "@/replay/types";
import type { SymbolScanResult } from "@/scanner/scanner-result";
import type { CanonicalCandle } from "@/types/market-data";

const M15 = 15 * 60_000;
const T0 = Date.UTC(2026, 0, 20, 0, 0, 0);

function candle(input: {
  timestamp: number;
  open?: number;
  high: number;
  low: number;
  close: number;
}): CanonicalCandle {
  return {
    symbol: "EURUSD",
    timeframe: "M15",
    timestamp: input.timestamp,
    open: input.open ?? input.close,
    high: input.high,
    low: input.low,
    close: input.close,
    volume: 100,
    source: "execution-test",
    closed: true,
  };
}

function dataset(candles: CanonicalCandle[]): ReplayDataset {
  return {
    id: "execution-simulator",
    symbols: {
      EURUSD: {
        metadata: {
          symbol: "EURUSD",
          baseCurrency: "EUR",
          quoteCurrency: "USD",
          pipSize: 0.0001,
          pricePrecision: 5,
          contractSize: 100_000,
          minLot: 0.01,
          maxLot: 100,
          lotStep: 0.01,
        },
        spreadPips: 1,
        candles: { M15: candles },
      },
    },
  };
}

function result(
  overrides: Partial<SymbolScanResult> = {}
): SymbolScanResult {
  return {
    symbol: "EURUSD",
    status: "ANALYSED",
    reason: "Analysed successfully.",
    executionEligible: false,
    latestPrice: 1.1,
    spreadPips: 1,
    regime: "TREND_UP",
    strategyId: "TREND_PULLBACK",
    bias: "STRONG_LONG",
    biasScore: 80,
    biasDirection: "LONG",
    setupState: "ARMED",
    setupScore: 85,
    triggerState: "CONFIRMED",
    triggerScore: 100,
    triggerAgeInBars: 0,
    riskReward: 2,
    positionSize: 1,
    executionDecision: "EXECUTE",
    signalState: "EXECUTE",
    signalId: "signal-1",
    freshness: "FRESH",
    updatedAt: T0,
    timeframes: [],
    executionDetail: null,
    riskDetail: {
      approved: true,
      rejectionReason: null,
      entryPrice: 1.1,
      stopLoss: 1.095,
      stopDistancePips: 50,
      takeProfit1: 1.11,
      takeProfit2: 1.115,
      riskCapital: 50,
      riskPercent: 0.5,
      positionSize: 1,
      plannedRR: 2,
      pipSize: 0.0001,
      accountCurrency: "USD",
    },
    evidence: [],
    conflicts: [],
    issues: [],
    errors: [],
    ...overrides,
  };
}

function step(
  asOf: number,
  scanResult: SymbolScanResult
): ReplayStep {
  return {
    index: Math.round((asOf - T0) / M15),
    asOf,
    snapshot: {
      startedAt: asOf,
      completedAt: asOf,
      durationMs: null,
      symbolsRequested: 1,
      symbolsSuccessful: 1,
      symbolsFailed: 0,
      results: [scanResult],
      providerStatus: null,
      freshnessSummary: { FRESH: 1, DELAYED: 0, STALE: 0 },
    },
  };
}

describe("HistoricalExecutionSimulator", () => {
  it("preserves strategy attribution on historical orders and positions", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([]),
      initialBalance: 10_000,
    });

    simulator.processStep(
      step(
        T0,
        result({
          strategyId: "BREAKOUT_RETEST",
          signalId: "breakout-signal",
        })
      )
    );

    const summary = simulator.getSummary();
    expect(summary.orders[0].engine.strategyId).toBe("BREAKOUT_RETEST");
    expect(summary.openPositions[0].engine.strategyId).toBe("BREAKOUT_RETEST");
  });

  it("opens exactly once for one actionable signal id", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([]),
      initialBalance: 10_000,
    });

    simulator.processStep(step(T0, result()));
    simulator.processStep(step(T0, result()));

    const summary = simulator.getSummary();
    expect(summary.orderCount).toBe(1);
    expect(summary.openPositionCount).toBe(1);
    expect(summary.closedTradeCount).toBe(0);
  });

  it("does not create an order for ENGINE EXECUTE when lifecycle is not EXECUTE", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([]),
      initialBalance: 10_000,
    });

    simulator.processStep(step(T0, result({ signalState: "CLOSED" })));

    expect(simulator.getSummary().orderCount).toBe(0);
  });

  it("does not use the entry candle high/low, then closes on the next candle TP", () => {
    const candles = [
      // This candle closes exactly at entry time and touches both SL and TP.
      candle({
        timestamp: T0 - M15,
        high: 1.12,
        low: 1.09,
        close: 1.1,
      }),
      // First post-entry candle: TP only.
      candle({
        timestamp: T0,
        high: 1.111,
        low: 1.099,
        close: 1.108,
      }),
    ];
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset(candles),
      initialBalance: 10_000,
    });

    simulator.processStep(step(T0, result()));
    expect(simulator.getSummary().openPositionCount).toBe(1);

    simulator.processStep(
      step(
        T0 + M15,
        result({ executionDecision: "WAIT", signalState: "MANAGE" })
      )
    );

    const summary = simulator.getSummary();
    expect(summary.openPositionCount).toBe(0);
    expect(summary.closedTradeCount).toBe(1);
    expect(summary.trades[0].closeReason).toBe("TAKE_PROFIT");
    expect(summary.trades[0].exitPrice).toBe(1.11);
    expect(summary.trades[0].realizedPnL).toBeCloseTo(100);
    expect(summary.trades[0].realizedR).toBeCloseTo(2);
    expect(summary.balance).toBeCloseTo(10_100);
  });

  it("uses STOP_FIRST for an ambiguous post-entry candle by default", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([
        candle({
          timestamp: T0,
          high: 1.112,
          low: 1.094,
          close: 1.101,
        }),
      ]),
      initialBalance: 10_000,
    });

    simulator.processStep(step(T0, result()));
    simulator.processStep(
      step(
        T0 + M15,
        result({ executionDecision: "WAIT", signalState: "MANAGE" })
      )
    );

    const trade = simulator.getSummary().trades[0];
    expect(trade.closeReason).toBe("STOP_LOSS");
    expect(trade.exitPrice).toBe(1.095);
    expect(trade.realizedR).toBeCloseTo(-1);
    expect(trade.maxFavorableR).toBeGreaterThan(2);
    expect(trade.maxAdverseR).toBeLessThan(-1);
  });

  it("can explicitly use TARGET_FIRST for ambiguous bars", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([
        candle({
          timestamp: T0,
          high: 1.112,
          low: 1.094,
          close: 1.101,
        }),
      ]),
      initialBalance: 10_000,
      config: {
        enabled: true,
        intrabarConflictPolicy: "TARGET_FIRST",
      },
    });

    simulator.processStep(step(T0, result()));
    simulator.processStep(
      step(
        T0 + M15,
        result({ executionDecision: "WAIT", signalState: "MANAGE" })
      )
    );

    expect(simulator.getSummary().trades[0].closeReason).toBe("TAKE_PROFIT");
  });

  it("closes a SHORT at TP with positive R", () => {
    const short = result({
      bias: "STRONG_SHORT",
      biasDirection: "SHORT",
      signalId: "signal-short",
      riskDetail: {
        approved: true,
        rejectionReason: null,
        entryPrice: 1.1,
        stopLoss: 1.105,
        stopDistancePips: 50,
        takeProfit1: 1.09,
        takeProfit2: 1.085,
        riskCapital: 50,
        riskPercent: 0.5,
        positionSize: 1,
        plannedRR: 2,
        pipSize: 0.0001,
        accountCurrency: "USD",
      },
    });
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([
        candle({
          timestamp: T0,
          high: 1.101,
          low: 1.089,
          close: 1.091,
        }),
      ]),
      initialBalance: 10_000,
    });

    simulator.processStep(step(T0, short));
    simulator.processStep(
      step(
        T0 + M15,
        result({
          signalId: "signal-short",
          executionDecision: "WAIT",
          signalState: "MANAGE",
        })
      )
    );

    const trade = simulator.getSummary().trades[0];
    expect(trade.side).toBe("SHORT");
    expect(trade.closeReason).toBe("TAKE_PROFIT");
    expect(trade.realizedR).toBeCloseTo(2);
  });

  it("processes unseen candles chronologically and stops at the first exit", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([
        candle({
          timestamp: T0,
          high: 1.105,
          low: 1.099,
          close: 1.104,
        }),
        candle({
          timestamp: T0 + M15,
          high: 1.111,
          low: 1.103,
          close: 1.109,
        }),
        candle({
          timestamp: T0 + 2 * M15,
          high: 1.12,
          low: 1.09,
          close: 1.1,
        }),
      ]),
      initialBalance: 10_000,
    });

    simulator.processStep(step(T0, result()));
    simulator.processStep(
      step(
        T0 + 3 * M15,
        result({ executionDecision: "WAIT", signalState: "MANAGE" })
      )
    );

    const trade = simulator.getSummary().trades[0];
    expect(trade.closeReason).toBe("TAKE_PROFIT");
    expect(trade.closedAt).toBe(T0 + 2 * M15);
  });

  it("enforces aggregate historical portfolio risk cap", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([]),
      initialBalance: 10_000,
      config: {
        enabled: true,
        maxTotalOpenRiskPercent: 0.5,
      },
    });

    simulator.processStep(step(T0, result({ signalId: "signal-a" })));
    simulator.processStep(
      step(T0, result({ signalId: "signal-b", symbol: "GBPUSD" }))
    );

    const summary = simulator.getSummary();
    expect(summary.openPositionCount).toBe(1);
    const rejected = summary.orders.find(
      (order) => order.signalId === "signal-b"
    );
    expect(rejected?.status).toBe("REJECTED");
    expect(rejected?.rejectionReason).toBe("HISTORICAL_MAX_TOTAL_RISK");
  });


  it("blocks a fresh signal while the same symbol is already open", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([]),
      initialBalance: 10_000,
    });

    simulator.processStep(step(T0, result({ signalId: "signal-a" })));
    simulator.processStep(step(T0, result({ signalId: "signal-b" })));

    const summary = simulator.getSummary();
    expect(summary.openPositionCount).toBe(1);
    expect(
      summary.orders.find((order) => order.signalId === "signal-b")
        ?.rejectionReason
    ).toBe("HISTORICAL_MAX_OPEN_POSITIONS_PER_SYMBOL");
  });

  it("blocks same-symbol re-entry during the stop-loss cooldown", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([
        candle({
          timestamp: T0,
          high: 1.101,
          low: 1.094,
          close: 1.096,
        }),
      ]),
      initialBalance: 10_000,
    });

    simulator.processStep(step(T0, result({ signalId: "signal-a" })));
    simulator.processStep(
      step(T0 + M15, result({ signalId: "signal-b" }))
    );

    const summary = simulator.getSummary();
    expect(summary.closedTradeCount).toBe(1);
    expect(summary.openPositionCount).toBe(0);
    expect(
      summary.orders.find((order) => order.signalId === "signal-b")
        ?.rejectionReason
    ).toBe("HISTORICAL_STOP_LOSS_COOLDOWN");
  });

  it("does not reopen a closed signal id on later replay steps", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([
        candle({
          timestamp: T0,
          high: 1.111,
          low: 1.099,
          close: 1.108,
        }),
      ]),
      initialBalance: 10_000,
    });

    simulator.processStep(step(T0, result()));
    simulator.processStep(
      step(T0 + M15, result())
    );
    simulator.processStep(
      step(T0 + 2 * M15, result())
    );

    const summary = simulator.getSummary();
    expect(summary.orderCount).toBe(1);
    expect(summary.closedTradeCount).toBe(1);
    expect(summary.openPositionCount).toBe(0);
  });

  it("rejects malformed executable risk snapshots fail-closed", () => {
    const simulator = new HistoricalExecutionSimulator({
      dataset: dataset([]),
      initialBalance: 10_000,
    });

    simulator.processStep(
      step(
        T0,
        result({
          riskDetail: {
            approved: true,
            rejectionReason: null,
            entryPrice: 1.1,
            stopLoss: 1.095,
            stopDistancePips: 0,
            takeProfit1: 1.11,
            takeProfit2: null,
            riskCapital: 50,
            riskPercent: 0.5,
            positionSize: 1,
            plannedRR: 2,
            pipSize: 0.0001,
            accountCurrency: "USD",
          },
        })
      )
    );

    const summary = simulator.getSummary();
    expect(summary.openPositionCount).toBe(0);
    expect(summary.orders[0].status).toBe("REJECTED");
    expect(summary.orders[0].rejectionReason).toBe(
      "HISTORICAL_EXECUTION_SNAPSHOT_INVALID"
    );
  });
});
