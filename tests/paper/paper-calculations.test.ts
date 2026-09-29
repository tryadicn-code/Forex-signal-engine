import { describe, expect, it } from "vitest";
import {
  calculatePerformance,
  calculatePnl,
  evaluateBarExit,
} from "@/paper/calculations";
import type { PaperPosition, PaperTrade } from "@/paper/types";
import type { CanonicalCandle } from "@/types/market-data";

function position(side: "LONG" | "SHORT"): PaperPosition {
  return {
    id: "p1",
    orderId: "o1",
    signalId: "s1",
    symbol: "EURUSD",
    side,
    entryPrice: 1.1,
    currentPrice: 1.1,
    stopLoss: side === "LONG" ? 1.095 : 1.105,
    takeProfit: side === "LONG" ? 1.11 : 1.09,
    positionSize: 1,
    pipSize: 0.0001,
    pipValuePerLotAccountCurrency: 1,
    riskAmount: 50,
    riskPercent: 0.5,
    plannedRR: 2,
    openedAt: 1_000,
    updatedAt: 1_000,
    lastEvaluatedCandleTimestamp: null,
    status: "OPEN",
    unrealizedPnL: 0,
    currentR: 0,
    engine: {
      bias: side === "LONG" ? "LONG" : "SHORT",
      setupScore: 80,
      executionDecision: "EXECUTE",
      freshness: "FRESH",
      engineVersion: "test",
      paperConfigVersion: "test",
    },
  };
}

describe("paper P/L", () => {
  it("calculates LONG P/L in account currency", () => {
    expect(
      calculatePnl({
        side: "LONG",
        entryPrice: 1.1,
        exitPrice: 1.11,
        pipSize: 0.0001,
        positionSize: 1,
        pipValuePerLotAccountCurrency: 1,
      })
    ).toBeCloseTo(100);
  });

  it("calculates SHORT P/L in account currency", () => {
    expect(
      calculatePnl({
        side: "SHORT",
        entryPrice: 1.1,
        exitPrice: 1.09,
        pipSize: 0.0001,
        positionSize: 1,
        pipValuePerLotAccountCurrency: 1,
      })
    ).toBeCloseTo(100);
  });
});

describe("intrabar ambiguity", () => {
  const candle: CanonicalCandle = {
    symbol: "EURUSD",
    timeframe: "M15",
    timestamp: 2_000,
    open: 1.1,
    high: 1.112,
    low: 1.094,
    close: 1.101,
    volume: 1,
    source: "test",
    closed: true,
  };

  it("defaults ambiguous bars to STOP_FIRST when configured", () => {
    expect(evaluateBarExit(position("LONG"), candle, "STOP_FIRST")).toEqual({
      exitPrice: 1.095,
      reason: "STOP_LOSS",
    });
  });

  it("can explicitly use TARGET_FIRST when configured", () => {
    expect(evaluateBarExit(position("LONG"), candle, "TARGET_FIRST")).toEqual({
      exitPrice: 1.11,
      reason: "TAKE_PROFIT",
    });
  });
});

describe("performance analytics", () => {
  it("computes profit factor, expectancy and drawdown from closed trades", () => {
    const base = {
      orderId: "o",
      positionId: "p",
      signalId: "s",
      symbol: "EURUSD",
      side: "LONG" as const,
      entryPrice: 1.1,
      exitPrice: 1.1,
      stopLoss: 1.095,
      takeProfit: 1.11,
      positionSize: 1,
      riskAmount: 50,
      riskPercent: 0.5,
      plannedRR: 2,
      realizedPnLPercent: 0,
      openedAt: 0,
      holdingDurationMs: 1_000,
      closeReason: "TAKE_PROFIT" as const,
      engine: position("LONG").engine,
    };
    const trades: PaperTrade[] = [
      { ...base, id: "t1", realizedPnL: 100, realizedR: 2, closedAt: 1_000 },
      {
        ...base,
        id: "t2",
        signalId: "s2",
        realizedPnL: -50,
        realizedR: -1,
        closedAt: 2_000,
        closeReason: "STOP_LOSS",
      },
    ];

    const result = calculatePerformance(trades, 10_000);
    expect(result.winRate).toBe(50);
    expect(result.profitFactor).toBe(2);
    expect(result.expectancy).toBe(25);
    expect(result.averageR).toBe(0.5);
    expect(result.maxDrawdownAmount).toBe(50);
  });
});
