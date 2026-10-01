import { candleCloseTime } from "@/market-data/timeframe";
import { calculatePnl, calculateR } from "@/paper/calculations";
import type {
  HistoricalCloseReason,
  HistoricalDirection,
  HistoricalExecutionConfig,
  HistoricalExecutionSummary,
  HistoricalEquityPoint,
  HistoricalIntrabarConflictPolicy,
  HistoricalOrder,
  HistoricalPosition,
  HistoricalTrade,
} from "@/replay/execution-types";
import type { ReplayDataset, ReplayStep } from "@/replay/types";
import type { SymbolScanResult } from "@/scanner/scanner-result";
import type { CanonicalCandle } from "@/types/market-data";
import { findDirectionalCurrencyExposureBlock } from "@/paper/exposure";

interface HistoricalExitDecision {
  exitPrice: number;
  reason: HistoricalCloseReason;
}

const DEFAULT_POLICY: HistoricalIntrabarConflictPolicy = "STOP_FIRST";

export class HistoricalExecutionSimulator {
  private readonly dataset: ReplayDataset;
  private readonly initialBalance: number;
  private readonly executionTimeframe;
  private readonly intrabarConflictPolicy: HistoricalIntrabarConflictPolicy;
  private readonly maxOpenPositions: number;
  private readonly maxTotalOpenRiskPercent: number;
  private readonly maxOpenPositionsPerSymbol: number;
  private readonly maxDirectionalCurrencyExposure: number;
  private readonly stopLossReentryCooldownMs: number;
  private orders: HistoricalOrder[] = [];
  private positions: HistoricalPosition[] = [];
  private trades: HistoricalTrade[] = [];
  private equityCurve: HistoricalEquityPoint[] = [];

  constructor(input: {
    dataset: ReplayDataset;
    initialBalance: number;
    config?: HistoricalExecutionConfig;
  }) {
    if (!Number.isFinite(input.initialBalance) || input.initialBalance <= 0) {
      throw new Error("Historical execution initialBalance must be positive.");
    }
    this.dataset = input.dataset;
    this.initialBalance = input.initialBalance;
    this.executionTimeframe = input.config?.executionTimeframe ?? "M15";
    this.intrabarConflictPolicy =
      input.config?.intrabarConflictPolicy ?? DEFAULT_POLICY;
    this.maxOpenPositions = input.config?.maxOpenPositions ?? 10;
    this.maxTotalOpenRiskPercent =
      input.config?.maxTotalOpenRiskPercent ?? 5;
    this.maxOpenPositionsPerSymbol =
      input.config?.maxOpenPositionsPerSymbol ?? 1;
    this.maxDirectionalCurrencyExposure =
      input.config?.maxDirectionalCurrencyExposure ?? 2;
    this.stopLossReentryCooldownMs =
      input.config?.stopLossReentryCooldownMs ?? 60 * 60_000;

    if (!Number.isInteger(this.maxOpenPositions) || this.maxOpenPositions <= 0) {
      throw new Error("Historical maxOpenPositions must be a positive integer.");
    }
    if (
      !Number.isFinite(this.maxTotalOpenRiskPercent) ||
      this.maxTotalOpenRiskPercent <= 0
    ) {
      throw new Error(
        "Historical maxTotalOpenRiskPercent must be a positive finite number."
      );
    }
  }

  /**
   * Advance existing positions to a replay market-time boundary.
   *
   * Runner integration calls this BEFORE the scanner evaluates new entries at
   * the same asOf so realized balance is available to the existing Risk Engine.
   */
  advanceTo(asOf: number): HistoricalExecutionSummary {
    this.advanceOpenPositions(asOf);
    return this.summary();
  }

  /** Consume only new execution decisions after the scanner has run at asOf. */
  consumeStep(step: ReplayStep): HistoricalExecutionSummary {
    this.consumeExecutions(step);
    this.recordEquityPoint(step.asOf);
    return this.summary();
  }

  /**
   * Convenience API for direct consumers/tests: advance exits first, then
   * consume new entries from the snapshot.
   *
   * Process one replay snapshot.
   *
   * Exit chronology is processed BEFORE new entries at the same asOf. Therefore
   * a signal discovered at the close of candle N cannot use candle N's high/low
   * to stop or target itself; the first eligible exit candle is N+1.
   */
  processStep(step: ReplayStep): HistoricalExecutionSummary {
    this.advanceTo(step.asOf);
    this.consumeStep(step);
    return this.summary();
  }

  getSummary(): HistoricalExecutionSummary {
    return this.summary();
  }

  private advanceOpenPositions(asOf: number): void {
    const open = this.positions.filter((position) => position.status === "OPEN");

    for (const position of open) {
      const symbol = this.dataset.symbols[position.symbol];
      if (!symbol) {
        throw new Error(
          "Historical execution dataset lost symbol " + position.symbol + "."
        );
      }
      const candles = symbol.candles[this.executionTimeframe];
      if (!candles) {
        throw new Error(
          "Historical execution requires " +
            this.executionTimeframe +
            " candles for " +
            position.symbol +
            "."
        );
      }

      const eligible = candles.filter((candle) => {
        const closeAt = candleCloseTime(this.executionTimeframe, candle.timestamp);
        if (closeAt > asOf) return false;
        // Never evaluate the candle that completed at or before the entry time.
        if (closeAt <= position.openedAt) return false;
        if (
          position.lastEvaluatedCandleTimestamp !== null &&
          candle.timestamp <= position.lastEvaluatedCandleTimestamp
        ) {
          return false;
        }
        return true;
      });

      for (const candle of eligible) {
        const current = this.positions.find(
          (item) => item.id === position.id && item.status === "OPEN"
        );
        if (!current) break;

        const excursionMarked = markHistoricalExcursion(
          current,
          candle,
          candleCloseTime(this.executionTimeframe, candle.timestamp)
        );
        this.replacePosition(excursionMarked);

        const exit = evaluateHistoricalBarExit(
          excursionMarked,
          candle,
          this.intrabarConflictPolicy
        );
        if (exit) {
          this.closePosition(
            excursionMarked,
            exit,
            candleCloseTime(this.executionTimeframe, candle.timestamp)
          );
          break;
        }

        this.replacePosition(markHistoricalPosition(
          excursionMarked,
          candle.close,
          candleCloseTime(this.executionTimeframe, candle.timestamp),
          candle.timestamp
        ));
      }
    }
  }

  private consumeExecutions(step: ReplayStep): void {
    for (const result of step.snapshot.results) {
      if (
        result.executionDecision !== "EXECUTE" ||
        result.signalState !== "EXECUTE" ||
        result.freshness !== "FRESH" ||
        !result.signalId
      ) {
        continue;
      }

      const executionKey = "historical:" + result.signalId;
      if (this.orders.some((order) => order.executionKey === executionKey)) {
        continue;
      }

      const rejection = validateHistoricalCandidate(result);
      if (rejection) {
        this.orders.push(rejectedOrder(result, executionKey, step.asOf, rejection));
        continue;
      }

      const portfolioRejection = this.validatePortfolioRisk(result, step.asOf);
      if (portfolioRejection) {
        this.orders.push(
          rejectedOrder(result, executionKey, step.asOf, portfolioRejection)
        );
        continue;
      }

      this.openPosition(result, executionKey, step.asOf);
    }
  }

  private validatePortfolioRisk(
    result: SymbolScanResult,
    asOf: number
  ): string | null {
    const openPositions = this.positions.filter(
      (position) => position.status === "OPEN"
    );
    if (openPositions.length >= this.maxOpenPositions) {
      return "HISTORICAL_MAX_OPEN_POSITIONS";
    }

    const sameSymbolCount = openPositions.filter(
      (position) => position.symbol === result.symbol
    ).length;
    if (sameSymbolCount >= this.maxOpenPositionsPerSymbol) {
      return "HISTORICAL_MAX_OPEN_POSITIONS_PER_SYMBOL";
    }

    const side =
      result.biasDirection === "SHORT" ? "SHORT" : "LONG";
    const exposureBlock = findDirectionalCurrencyExposureBlock(
      openPositions,
      result.symbol,
      side,
      this.maxDirectionalCurrencyExposure
    );
    if (exposureBlock) {
      return "HISTORICAL_DIRECTIONAL_CURRENCY_EXPOSURE";
    }

    const lastStop = [...this.trades]
      .filter(
        (trade) =>
          trade.symbol === result.symbol &&
          trade.closeReason === "STOP_LOSS"
      )
      .sort((a, b) => b.closedAt - a.closedAt)[0];
    if (
      lastStop &&
      asOf - lastStop.closedAt < this.stopLossReentryCooldownMs
    ) {
      return "HISTORICAL_STOP_LOSS_COOLDOWN";
    }

    const balance = this.balance();
    const currentOpenRisk = openPositions.reduce(
      (sum, position) => sum + position.riskAmount,
      0
    );
    const candidateRisk = result.riskDetail?.riskCapital ?? 0;
    const projectedRiskPercent =
      balance > 0
        ? ((currentOpenRisk + candidateRisk) / balance) * 100
        : Number.POSITIVE_INFINITY;

    if (projectedRiskPercent > this.maxTotalOpenRiskPercent + 1e-9) {
      return "HISTORICAL_MAX_TOTAL_RISK";
    }

    return null;
  }

  private openPosition(
    result: SymbolScanResult,
    executionKey: string,
    at: number
  ): void {
    const risk = result.riskDetail!;
    const signalId = result.signalId!;
    const side = result.biasDirection as HistoricalDirection;
    const entry = risk.entryPrice!;
    const stopPips = risk.stopDistancePips!;
    const size = risk.positionSize!;
    const riskAmount = risk.riskCapital!;
    const pipValuePerLotAccountCurrency = riskAmount / (stopPips * size);

    const order: HistoricalOrder = {
      id: "historical-order-" + signalId,
      executionKey,
      signalId,
      symbol: result.symbol,
      side,
      requestedAt: at,
      filledAt: at,
      requestedEntry: entry,
      fillPrice: entry,
      stopLoss: risk.stopLoss!,
      takeProfit: risk.takeProfit1 ?? null,
      positionSize: size,
      riskAmount,
      riskPercent: risk.riskPercent!,
      plannedRR: risk.plannedRR ?? null,
      status: "FILLED",
      rejectionReason: null,
      engine: engineSnapshot(result),
    };

    const position: HistoricalPosition = {
      id: "historical-position-" + signalId,
      orderId: order.id,
      signalId,
      symbol: result.symbol,
      side,
      entryPrice: entry,
      currentPrice: entry,
      stopLoss: risk.stopLoss!,
      takeProfit: risk.takeProfit1 ?? null,
      positionSize: size,
      pipSize: risk.pipSize!,
      pipValuePerLotAccountCurrency,
      riskAmount,
      riskPercent: risk.riskPercent!,
      plannedRR: risk.plannedRR ?? null,
      openedAt: at,
      updatedAt: at,
      lastEvaluatedCandleTimestamp: null,
      status: "OPEN",
      unrealizedPnL: 0,
      currentR: 0,
      maxFavorableR: 0,
      maxAdverseR: 0,
      engine: order.engine,
    };

    this.orders.push(order);
    this.positions.push(position);
  }

  private closePosition(
    position: HistoricalPosition,
    decision: HistoricalExitDecision,
    closedAt: number
  ): void {
    const current = this.positions.find(
      (item) => item.id === position.id && item.status === "OPEN"
    );
    if (!current) return;

    const realizedPnL = calculatePnl({
      side: current.side,
      entryPrice: current.entryPrice,
      exitPrice: decision.exitPrice,
      pipSize: current.pipSize,
      positionSize: current.positionSize,
      pipValuePerLotAccountCurrency: current.pipValuePerLotAccountCurrency,
    });
    const realizedR = calculateR(realizedPnL, current.riskAmount);
    const balanceBefore = this.balance();

    const trade: HistoricalTrade = {
      id: "historical-trade-" + current.signalId,
      orderId: current.orderId,
      positionId: current.id,
      signalId: current.signalId,
      symbol: current.symbol,
      side: current.side,
      entryPrice: current.entryPrice,
      exitPrice: decision.exitPrice,
      stopLoss: current.stopLoss,
      takeProfit: current.takeProfit,
      positionSize: current.positionSize,
      riskAmount: current.riskAmount,
      riskPercent: current.riskPercent,
      plannedRR: current.plannedRR,
      realizedPnL,
      realizedPnLPercent:
        balanceBefore > 0 ? (realizedPnL / balanceBefore) * 100 : 0,
      realizedR,
      maxFavorableR: current.maxFavorableR ?? Math.max(0, realizedR),
      maxAdverseR: current.maxAdverseR ?? Math.min(0, realizedR),
      openedAt: current.openedAt,
      closedAt,
      holdingDurationMs: Math.max(0, closedAt - current.openedAt),
      closeReason: decision.reason,
      engine: current.engine,
    };

    this.replacePosition({
      ...current,
      currentPrice: decision.exitPrice,
      updatedAt: closedAt,
      status: "CLOSED",
      unrealizedPnL: 0,
      currentR: realizedR,
    });

    if (!this.trades.some((item) => item.id === trade.id)) {
      this.trades.push(trade);
    }
  }

  private replacePosition(position: HistoricalPosition): void {
    const index = this.positions.findIndex((item) => item.id === position.id);
    if (index >= 0) this.positions[index] = position;
  }

  private recordEquityPoint(asOf: number): void {
    const snapshot = this.summary();
    const point: HistoricalEquityPoint = {
      asOf,
      balance: snapshot.balance,
      equity: snapshot.equity,
      realizedPnL: snapshot.realizedPnL,
      unrealizedPnL: snapshot.unrealizedPnL,
      openPositionCount: snapshot.openPositionCount,
      openRiskPercent: snapshot.openRiskPercent,
    };

    const existingIndex = this.equityCurve.findIndex(
      (item) => item.asOf === asOf
    );
    if (existingIndex >= 0) {
      this.equityCurve[existingIndex] = point;
    } else {
      this.equityCurve.push(point);
      this.equityCurve.sort((a, b) => a.asOf - b.asOf);
    }
  }

  private balance(): number {
    return (
      this.initialBalance +
      this.trades.reduce((sum, trade) => sum + trade.realizedPnL, 0)
    );
  }

  private summary(): HistoricalExecutionSummary {
    const openPositions = this.positions.filter(
      (position) => position.status === "OPEN"
    );
    const realizedPnL = this.trades.reduce(
      (sum, trade) => sum + trade.realizedPnL,
      0
    );
    const unrealizedPnL = openPositions.reduce(
      (sum, position) => sum + position.unrealizedPnL,
      0
    );
    const balance = this.initialBalance + realizedPnL;
    const openRiskAmount = openPositions.reduce(
      (sum, position) => sum + position.riskAmount,
      0
    );

    return {
      enabled: true,
      executionTimeframe: this.executionTimeframe,
      intrabarConflictPolicy: this.intrabarConflictPolicy,
      initialBalance: this.initialBalance,
      balance,
      equity: balance + unrealizedPnL,
      realizedPnL,
      unrealizedPnL,
      openRiskAmount,
      openRiskPercent:
        balance > 0 ? (openRiskAmount / balance) * 100 : 0,
      orderCount: this.orders.length,
      openPositionCount: openPositions.length,
      closedTradeCount: this.trades.length,
      orders: this.orders.map((order) => ({ ...order })),
      openPositions: openPositions.map((position) => ({ ...position })),
      trades: this.trades.map((trade) => ({ ...trade })),
      equityCurve: this.equityCurve.map((point) => ({ ...point })),
    };
  }
}

function validateHistoricalCandidate(result: SymbolScanResult): string | null {
  if (result.biasDirection !== "LONG" && result.biasDirection !== "SHORT") {
    return "HISTORICAL_DIRECTION_INVALID";
  }
  const risk = result.riskDetail;
  if (!risk?.approved) return "HISTORICAL_RISK_NOT_APPROVED";

  const required = [
    risk.entryPrice,
    risk.stopLoss,
    risk.stopDistancePips,
    risk.positionSize,
    risk.riskCapital,
    risk.riskPercent,
    risk.pipSize,
  ];
  if (
    required.some(
      (value) => typeof value !== "number" || !Number.isFinite(value)
    )
  ) {
    return "HISTORICAL_EXECUTION_SNAPSHOT_INCOMPLETE";
  }

  if (
    risk.entryPrice! <= 0 ||
    risk.stopLoss! <= 0 ||
    risk.stopDistancePips! <= 0 ||
    risk.positionSize! <= 0 ||
    risk.riskCapital! <= 0 ||
    risk.riskPercent! <= 0 ||
    risk.pipSize! <= 0
  ) {
    return "HISTORICAL_EXECUTION_SNAPSHOT_INVALID";
  }

  if (
    result.biasDirection === "LONG" &&
    risk.stopLoss! >= risk.entryPrice!
  ) {
    return "HISTORICAL_INVALID_LONG_STOP";
  }
  if (
    result.biasDirection === "SHORT" &&
    risk.stopLoss! <= risk.entryPrice!
  ) {
    return "HISTORICAL_INVALID_SHORT_STOP";
  }
  if (
    risk.takeProfit1 !== null &&
    risk.takeProfit1 !== undefined &&
    (!Number.isFinite(risk.takeProfit1) ||
      risk.takeProfit1 <= 0 ||
      (result.biasDirection === "LONG"
        ? risk.takeProfit1 <= risk.entryPrice!
        : risk.takeProfit1 >= risk.entryPrice!))
  ) {
    return "HISTORICAL_INVALID_TARGET";
  }

  return null;
}

function rejectedOrder(
  result: SymbolScanResult,
  executionKey: string,
  at: number,
  rejectionReason: string
): HistoricalOrder {
  const risk = result.riskDetail;
  return {
    id: "historical-order-" + result.signalId,
    executionKey,
    signalId: result.signalId!,
    symbol: result.symbol,
    side:
      result.biasDirection === "SHORT" ? "SHORT" : "LONG",
    requestedAt: at,
    filledAt: null,
    requestedEntry: risk?.entryPrice ?? 0,
    fillPrice: null,
    stopLoss: risk?.stopLoss ?? 0,
    takeProfit: risk?.takeProfit1 ?? null,
    positionSize: risk?.positionSize ?? 0,
    riskAmount: risk?.riskCapital ?? 0,
    riskPercent: risk?.riskPercent ?? 0,
    plannedRR: risk?.plannedRR ?? null,
    status: "REJECTED",
    rejectionReason,
    engine: engineSnapshot(result),
  };
}

function engineSnapshot(result: SymbolScanResult) {
  return {
    bias: result.bias,
    setupScore: result.setupScore,
    executionDecision: "EXECUTE" as const,
    freshness: "FRESH" as const,
  };
}

function markHistoricalPosition(
  position: HistoricalPosition,
  currentPrice: number,
  updatedAt: number,
  candleTimestamp: number
): HistoricalPosition {
  const unrealizedPnL = calculatePnl({
    side: position.side,
    entryPrice: position.entryPrice,
    exitPrice: currentPrice,
    pipSize: position.pipSize,
    positionSize: position.positionSize,
    pipValuePerLotAccountCurrency: position.pipValuePerLotAccountCurrency,
  });

  return {
    ...position,
    currentPrice,
    updatedAt,
    lastEvaluatedCandleTimestamp: candleTimestamp,
    unrealizedPnL,
    currentR: calculateR(unrealizedPnL, position.riskAmount),
    maxFavorableR: Math.max(
      position.maxFavorableR ?? 0,
      calculateR(unrealizedPnL, position.riskAmount)
    ),
    maxAdverseR: Math.min(
      position.maxAdverseR ?? 0,
      calculateR(unrealizedPnL, position.riskAmount)
    ),
  };
}

function markHistoricalExcursion(
  position: HistoricalPosition,
  candle: CanonicalCandle,
  updatedAt: number
): HistoricalPosition {
  const favorablePrice =
    position.side === "LONG" ? candle.high : candle.low;
  const adversePrice =
    position.side === "LONG" ? candle.low : candle.high;
  const favorableR = calculateR(
    calculatePnl({
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: favorablePrice,
      pipSize: position.pipSize,
      positionSize: position.positionSize,
      pipValuePerLotAccountCurrency: position.pipValuePerLotAccountCurrency,
    }),
    position.riskAmount
  );
  const adverseR = calculateR(
    calculatePnl({
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: adversePrice,
      pipSize: position.pipSize,
      positionSize: position.positionSize,
      pipValuePerLotAccountCurrency: position.pipValuePerLotAccountCurrency,
    }),
    position.riskAmount
  );

  return {
    ...position,
    updatedAt,
    maxFavorableR: Math.max(position.maxFavorableR ?? 0, favorableR),
    maxAdverseR: Math.min(position.maxAdverseR ?? 0, adverseR),
  };
}

function evaluateHistoricalBarExit(
  position: HistoricalPosition,
  candle: CanonicalCandle,
  policy: HistoricalIntrabarConflictPolicy
): HistoricalExitDecision | null {
  const stopTouched =
    position.side === "LONG"
      ? candle.low <= position.stopLoss
      : candle.high >= position.stopLoss;
  const targetTouched =
    position.takeProfit !== null &&
    (position.side === "LONG"
      ? candle.high >= position.takeProfit
      : candle.low <= position.takeProfit);

  if (!stopTouched && !targetTouched) return null;

  if (stopTouched && targetTouched) {
    if (policy === "REJECT_AMBIGUOUS") {
      return { exitPrice: position.stopLoss, reason: "AMBIGUOUS_BAR" };
    }
    if (policy === "TARGET_FIRST" && position.takeProfit !== null) {
      return { exitPrice: position.takeProfit, reason: "TAKE_PROFIT" };
    }
    return { exitPrice: position.stopLoss, reason: "STOP_LOSS" };
  }

  if (stopTouched) {
    return { exitPrice: position.stopLoss, reason: "STOP_LOSS" };
  }

  return position.takeProfit === null
    ? null
    : { exitPrice: position.takeProfit, reason: "TAKE_PROFIT" };
}
