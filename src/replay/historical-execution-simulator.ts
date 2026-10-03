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
  private readonly applySpread: boolean;
  private readonly maxEntryDriftPips: number;
  private readonly commissionPerLotPerSide: number;
  private readonly swapLongPerLotPerNight: number;
  private readonly swapShortPerLotPerNight: number;
  private readonly rolloverHourUtc: number;
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
    this.applySpread = input.config?.applySpread ?? false;
    // B3-C2: default Infinity disables the check so legacy fixtures keep
    // their original open-everything behaviour. Production backtests should
    // set maxEntryDriftPips = 2 to mirror MT5_TRADE_MAX_DEVIATION_POINTS / 10.
    this.maxEntryDriftPips = input.config?.maxEntryDriftPips ?? Number.POSITIVE_INFINITY;
    if (
      !(this.maxEntryDriftPips > 0) ||
      Number.isNaN(this.maxEntryDriftPips)
    ) {
      throw new Error(
        "Historical maxEntryDriftPips must be positive or Infinity."
      );
    }
    if (!Number.isFinite(this.maxEntryDriftPips)) {
      console.warn(
        "[HistoricalExecutionSimulator] maxEntryDriftPips is Infinity: signals are never rejected for entry drift. Set config.execution.maxEntryDriftPips = 2 for realistic backtests."
      );
    }

    // B3-C3: commission and swap. Defaults are 0 so legacy fixtures keep
    // their original P&L; production backtests should set realistic values.
    this.commissionPerLotPerSide =
      input.config?.commissionPerLotPerSide ?? 0;
    this.swapLongPerLotPerNight =
      input.config?.swapLongPerLotPerNight ?? 0;
    this.swapShortPerLotPerNight =
      input.config?.swapShortPerLotPerNight ?? 0;
    this.rolloverHourUtc = input.config?.rolloverHourUtc ?? 21;

    for (const [name, value] of [
      ["commissionPerLotPerSide", this.commissionPerLotPerSide],
      ["swapLongPerLotPerNight", this.swapLongPerLotPerNight],
      ["swapShortPerLotPerNight", this.swapShortPerLotPerNight],
    ] as const) {
      if (!Number.isFinite(value)) {
        throw new Error(
          "Historical " + name + " must be a finite number."
        );
      }
    }
    if (
      !Number.isInteger(this.rolloverHourUtc) ||
      this.rolloverHourUtc < 0 ||
      this.rolloverHourUtc > 23
    ) {
      throw new Error(
        "Historical rolloverHourUtc must be an integer in [0, 23]."
      );
    }
    const allCostsZero =
      this.commissionPerLotPerSide === 0 &&
      this.swapLongPerLotPerNight === 0 &&
      this.swapShortPerLotPerNight === 0;
    if (allCostsZero) {
      console.warn(
        "[HistoricalExecutionSimulator] commission and swap are zero: backtest P&L excludes broker fees. Set config.execution.commissionPerLotPerSide and swap*PerLotPerNight for realistic results."
      );
    }

    if (!this.applySpread) {
      console.warn(
        "[HistoricalExecutionSimulator] applySpread is false: backtest P&L excludes the dataset spread. Set config.execution.applySpread = true for realistic results."
      );
    }

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

      // B3-C2: resolve current market price and reject signals whose entry
      // reference has drifted beyond the allowed band. Matches the live
      // bridge behaviour (MT5_TRADE_MAX_DEVIATION_POINTS) so the backtest
      // cannot fill trades that a real broker would refuse.
      const plannedEntry = result.riskDetail!.entryPrice!;
      const pipSize = result.riskDetail!.pipSize!;
      const marketPrice = this.resolveCurrentMarketPrice(
        result.symbol,
        step.asOf
      );
      // When no closed candle exists at asOf (e.g. a signal on the very
      // first replay step), fall back to the planned entry. Drift cannot be
      // measured against a non-existent market price.
      const effectiveFillPrice = marketPrice ?? plannedEntry;
      if (marketPrice !== null) {
        const driftPips =
          Math.abs(marketPrice - plannedEntry) / pipSize;
        if (driftPips > this.maxEntryDriftPips) {
          this.orders.push(
            rejectedOrder(
              result,
              executionKey,
              step.asOf,
              "HISTORICAL_ENTRY_DRIFT_EXCEEDED"
            )
          );
          continue;
        }
      }

      const portfolioRejection = this.validatePortfolioRisk(result, step.asOf);
      if (portfolioRejection) {
        this.orders.push(
          rejectedOrder(result, executionKey, step.asOf, portfolioRejection)
        );
        continue;
      }

      this.openPosition(result, executionKey, step.asOf, effectiveFillPrice);
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
    at: number,
    fillPrice: number
  ): void {
    const risk = result.riskDetail!;
    const signalId = result.signalId!;
    const side = result.biasDirection as HistoricalDirection;
    // B3-C2: the planned entry is the strategy's frozen reference; the
    // actual fill is the current market price. Stop and target remain tied
    // to the plan; P&L is calculated from the real fill, so the backtest
    // experiences the same slippage a live order would.
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
      fillPrice: fillPrice,
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
      entryPrice: fillPrice,
      currentPrice: fillPrice,
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

    const grossRealizedPnL = calculatePnl({
      side: current.side,
      entryPrice: current.entryPrice,
      exitPrice: decision.exitPrice,
      pipSize: current.pipSize,
      positionSize: current.positionSize,
      pipValuePerLotAccountCurrency: current.pipValuePerLotAccountCurrency,
    });
    // B3-C1: subtract the dataset spread from every round-trip P&L.
    // A LONG enters at ask and exits at bid, a SHORT enters at bid and exits
    // at ask; both pay exactly one full spread per round trip. Without this
    // the backtest reports phantom profit equal to spread * pipValue * size
    // per trade.
    const spreadPips = this.applySpread
      ? Math.max(0, this.dataset.symbols[current.symbol]?.spreadPips ?? 0)
      : 0;
    const spreadCost =
      spreadPips *
      current.pipValuePerLotAccountCurrency *
      current.positionSize;

    // B3-C3: commission per side per lot, charged on entry and exit.
    const commissionCost =
      this.commissionPerLotPerSide * current.positionSize * 2;

    // B3-C3: swap. Count rollover crossings and apply the direction-specific
    // per-lot-per-night cost. Positive values are costs (the common case).
    const nights = this.countRollovers(current.openedAt, closedAt);
    const swapRatePerLotPerNight =
      current.side === "LONG"
        ? this.swapLongPerLotPerNight
        : this.swapShortPerLotPerNight;
    const swapCost =
      swapRatePerLotPerNight * current.positionSize * nights;

    const realizedPnL =
      grossRealizedPnL - spreadCost - commissionCost - swapCost;
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

  /**
   * B3-C2: close price of the most recent candle whose close time is at or
   * before `asOf`. Mirrors what MT5 would quote when a live order is placed
   * at that instant. Returns null when no eligible candle exists so the
   * caller can reject instead of filling at a stale price.
   */
  private resolveCurrentMarketPrice(
    symbol: string,
    asOf: number
  ): number | null {
    const symbolData = this.dataset.symbols[symbol];
    if (!symbolData) return null;
    const candles = symbolData.candles[this.executionTimeframe];
    if (!candles || candles.length === 0) return null;

    let lo = 0;
    let hi = candles.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const closeAt = candleCloseTime(
        this.executionTimeframe,
        candles[mid].timestamp
      );
      if (closeAt <= asOf) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best >= 0 ? candles[best].close : null;
  }

  /**
   * B3-C3: number of times the daily rollover hour (UTC) is crossed between
   * openedAt (exclusive) and closedAt (inclusive). Standard FX convention:
   * a position held across 21:00 UTC pays one night of swap per crossing.
   */
  private countRollovers(
    openedAt: number,
    closedAt: number
  ): number {
    if (closedAt <= openedAt) return 0;
    const MS_PER_DAY = 86_400_000;
    const rolloverMs = this.rolloverHourUtc * 3_600_000;
    const firstDay = Math.floor((openedAt - rolloverMs) / MS_PER_DAY);
    const lastDay = Math.floor((closedAt - rolloverMs - 1) / MS_PER_DAY);
    return Math.max(0, lastDay - firstDay);
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
  if (!result.strategyId) {
    return "HISTORICAL_STRATEGY_UNATTRIBUTED";
  }
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
    strategyId: result.strategyId ?? null,
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
      return {
        exitPrice: stopExitPrice(position, candle),
        reason: "AMBIGUOUS_BAR",
      };
    }
    if (policy === "TARGET_FIRST" && position.takeProfit !== null) {
      return { exitPrice: position.takeProfit, reason: "TAKE_PROFIT" };
    }
    return {
      exitPrice: stopExitPrice(position, candle),
      reason: "STOP_LOSS",
    };
  }

  if (stopTouched) {
    return {
      exitPrice: stopExitPrice(position, candle),
      reason: "STOP_LOSS",
    };
  }

  return position.takeProfit === null
    ? null
    : { exitPrice: position.takeProfit, reason: "TAKE_PROFIT" };
}

/**
 * B3-H1: real stop fill price accounting for gaps.
 *
 * When a bar opens past the stop (down for LONG, up for SHORT), the exchange
 * fills the order at the open, not at the stop price. Modelled conservatively:
 * the trader receives the worse of the stop and the open, never the better.
 *
 * Without this correction a weekend or news gap silently becomes phantom
 * profit equal to the gap distance on every stopped-out trade.
 */
function stopExitPrice(
  position: HistoricalPosition,
  candle: CanonicalCandle
): number {
  if (position.side === "LONG") {
    return candle.open < position.stopLoss ? candle.open : position.stopLoss;
  }
  return candle.open > position.stopLoss ? candle.open : position.stopLoss;
}
