import type { MarketDataProvider } from "@/providers/market-data/provider";
import type { ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";
import { candleCloseTime, intervalMs } from "@/market-data/timeframe";
import {
  resolvePaperTradingConfig,
  type PaperTradingConfig,
} from "@/config/paper";
import {
  calculatePerformance,
  calculatePnl,
  calculateR,
  evaluateBarExit,
  evaluatePriceExit,
  markPosition,
  markPositionExcursion,
  type ExitDecision,
} from "@/paper/calculations";
import type {
  PaperAccountSummary,
  PaperDashboardData,
  PaperDirection,
  PaperOrder,
  PaperPosition,
  PaperReleaseIdentity,
  PaperStoreState,
  PaperTrade,
} from "@/paper/types";
import type { PaperStore } from "@/paper/store";
import { findDirectionalCurrencyExposureBlock } from "@/paper/exposure";

const ENGINE_VERSION = "phase-4";
const PAPER_CONFIG_VERSION = "phase-4.1";
/**
 * M7-2: minimum candle window when scanning for exits on an open position.
 *
 * A fixed window silently skipped SL/TP touches on positions older than the
 * window. The effective lookback is now max(MIN, barsSinceOpen + BUFFER),
 * computed per position.
 */
const POSITION_CANDLE_LOOKBACK_MIN = 500;
const POSITION_CANDLE_LOOKBACK_BUFFER = 100;

export class PaperTradingService {
  private queue: Promise<void> = Promise.resolve();
  private readonly config: PaperTradingConfig;

  constructor(
    private readonly store: PaperStore,
    configOverrides?: Partial<PaperTradingConfig>
  ) {
    this.config = resolvePaperTradingConfig(configOverrides);
  }

  async getDashboard(): Promise<PaperDashboardData> {
    try {
      const state = await this.loadOrCreate(Date.now());
      return this.toDashboard(state, null);
    } catch (error) {
      return this.unavailableDashboard(error);
    }
  }

  async getBalance(): Promise<number> {
    const state = await this.loadOrCreate(Date.now());
    return this.accountSummary(state).balance;
  }

  async getStateSnapshot(): Promise<PaperStoreState> {
    return structuredClone(await this.loadOrCreate(Date.now()));
  }

  async reset(
    at: number = Date.now(),
    initialBalance?: number
  ): Promise<PaperDashboardData> {
    return this.serialize(async () => {
      const existing = await this.store.load();
      const nextInitialBalance =
        initialBalance ??
        existing?.account.initialBalance ??
        this.config.initialBalance;

      if (
        !Number.isFinite(nextInitialBalance) ||
        nextInitialBalance <= 0 ||
        nextInitialBalance > 1_000_000_000
      ) {
        throw new Error(
          "Paper initial balance must be greater than 0 and no more than 1,000,000,000."
        );
      }

      const state = this.initialState(at, nextInitialBalance);
      await this.store.save(state);
      return this.toDashboard(state, null);
    });
  }

  async closePositionManually(
    positionId: string,
    marketData: MarketDataProvider,
    at: number = Date.now()
  ): Promise<PaperDashboardData> {
    return this.serialize(async () => {
      const state = await this.loadOrCreate(at);
      const position = state.positions.find(
        (item) => item.id === positionId && item.status === "OPEN"
      );
      if (!position) {
        throw new Error("Paper position is not open or does not exist.");
      }

      const quote = await marketData.getLatestPrice(position.symbol, at);
      if (!quote.ok || !Number.isFinite(quote.data.price) || quote.data.price <= 0) {
        throw new Error(
          quote.ok
            ? "Latest market price is invalid."
            : "Latest market price is unavailable: " + quote.error.message
        );
      }

      const marked = markPosition(position, quote.data.price, at);
      this.replacePosition(state, marked);
      this.closePosition(
        state,
        marked,
        { exitPrice: quote.data.price, reason: "MANUAL_PAPER_CLOSE", sizeFraction: 1 },
        at
      );
      await this.store.save(state);
      return this.toDashboard(state, null);
    });
  }

  /**
   * TRD-RR-008: ubah planned RR untuk posisi OPEN.
   * SL tetap. TP dihitung ulang: newTP = entry +/- |entry - SL| * newRR.
   * Hanya legacy single-TP position (bukan partial TRD-RR-003).
   */
  async updatePositionRR(
    positionId: string,
    newRR: number,
    marketData: MarketDataProvider,
    at: number = Date.now()
  ): Promise<PaperDashboardData> {
    return this.serialize(async () => {
      if (!Number.isFinite(newRR) || newRR < 0.5 || newRR > 10) {
        throw new Error("RR harus di antara 0.5 dan 10.");
      }

      const state = await this.loadOrCreate(at);
      const position = state.positions.find(
        (item) => item.id === positionId && item.status === "OPEN"
      );
      if (!position) {
        throw new Error("Paper position is not open or does not exist.");
      }

      if (position.tp1 != null) {
        throw new Error(
          "Partial-TP position tidak didukung di MVP. Fitur ini hanya untuk legacy single-TP."
        );
      }

      const stopDistance = Math.abs(position.entryPrice - position.stopLoss);
      if (!(stopDistance > 0)) {
        throw new Error("Stop distance tidak valid.");
      }

      const long = position.side === "LONG";
      const newTP = long
        ? position.entryPrice + stopDistance * newRR
        : position.entryPrice - stopDistance * newRR;

      const quote = await marketData.getLatestPrice(position.symbol, at);
      if (!quote.ok || !Number.isFinite(quote.data.price) || quote.data.price <= 0) {
        throw new Error(
          quote.ok
            ? "Latest market price is invalid."
            : "Latest market price is unavailable: " + quote.error.message
        );
      }
      const currentPrice = quote.data.price;

      if (long && newTP <= currentPrice) {
        throw new Error("TP baru harus di atas harga sekarang (LONG).");
      }
      if (!long && newTP >= currentPrice) {
        throw new Error("TP baru harus di bawah harga sekarang (SHORT).");
      }

      const previousRR = position.plannedRR;
      const marked = markPosition(position, currentPrice, at);

      this.replacePosition(state, {
        ...marked,
        takeProfit: newTP,
        plannedRR: newRR,
        updatedAt: at,
      });

      state.ledger.push({
        id: `ledger-rr-${position.signalId}-${at}`,
        type: "POSITION_MODIFIED",
        timestamp: at,
        symbol: position.symbol,
        signalId: position.signalId,
        amount: 0,
        note: `RR modified: previous ${previousRR ?? "n/a"} -> ${newRR}. TP: ${position.takeProfit ?? "n/a"} -> ${newTP}.`,
      });

      await this.store.save(state);
      return this.toDashboard(state, null);
    });
  }

  async processSnapshot(
    snapshot: ScannerSnapshot,
    marketData: MarketDataProvider,
    release: PaperReleaseIdentity | null = null
  ): Promise<PaperDashboardData> {
    return this.serialize(async () => {
      const asOf = snapshot.completedAt ?? snapshot.startedAt;
      const state = await this.loadOrCreate(asOf);

      await this.manageOpenPositions(state, snapshot, marketData, asOf);
      this.consumeExecutions(state, snapshot, asOf, release);

      await this.store.save(state);
      return this.toDashboard(state, null);
    });
  }

  private async serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private initialState(
    at: number,
    initialBalance: number = this.config.initialBalance
  ): PaperStoreState {
    return {
      schemaVersion: 1,
      account: {
        currency: this.config.accountCurrency,
        initialBalance,
        createdAt: at,
      },
      orders: [],
      positions: [],
      trades: [],
      ledger: [
        {
          id: `ledger-account-${at}`,
          type: "ACCOUNT_CREATED",
          timestamp: at,
          symbol: null,
          signalId: null,
          amount: initialBalance,
          note: `Paper account created with ${initialBalance} ${this.config.accountCurrency}.`,
        },
      ],
    };
  }

  private async loadOrCreate(at: number): Promise<PaperStoreState> {
    const existing = await this.store.load();
    if (existing) return existing;
    const created = this.initialState(at);
    await this.store.save(created);
    return created;
  }

  private async manageOpenPositions(
    state: PaperStoreState,
    snapshot: ScannerSnapshot,
    marketData: MarketDataProvider,
    asOf: number
  ): Promise<void> {
    const bySymbol = new Map(snapshot.results.map((result) => [result.symbol, result]));

    for (const original of [...state.positions]) {
      if (original.status !== "OPEN") continue;
      let position = original;
      const latest = bySymbol.get(position.symbol);
      const currentPrice = latest?.latestPrice;

      if (typeof currentPrice === "number" && Number.isFinite(currentPrice) && currentPrice > 0) {
        position = markPosition(position, currentPrice, asOf);
        this.replacePosition(state, position);

        const liveEvents = evaluatePriceExit(position, currentPrice);
        if (liveEvents.length > 0) {
          for (const ev of liveEvents) {
            const current = state.positions.find((item) => item.id === position.id);
            if (!current || current.status !== "OPEN") break;
            this.applyExitEvent(state, current, ev, asOf);
          }
          continue;
        }
      }

      const barsSinceOpen = Math.ceil(
        (asOf - position.openedAt) / intervalMs("M15")
      );
      const lookback = Math.max(
        POSITION_CANDLE_LOOKBACK_MIN,
        barsSinceOpen + POSITION_CANDLE_LOOKBACK_BUFFER
      );
      const candleResult = await marketData.getCandles({
        symbol: position.symbol,
        timeframe: "M15",
        limit: lookback,
        asOf,
      });
      if (!candleResult.ok) continue;

      const eligible = candleResult.data
        .filter((candle) => candle.closed)
        .filter((candle) => candle.timestamp >= position.openedAt)
        .filter((candle) =>
          position.lastEvaluatedCandleTimestamp === null
            ? true
            : candle.timestamp > position.lastEvaluatedCandleTimestamp
        )
        .sort((a, b) => a.timestamp - b.timestamp);

      for (const candle of eligible) {
        // Provider contracts return only bars closed by asOf; keep the explicit
        // boundary here as a second no-look-ahead guard.
        if (candleCloseTime("M15", candle.timestamp) > asOf) continue;

        position = markPositionExcursion(
          position,
          candle,
          candleCloseTime("M15", candle.timestamp)
        );
        this.replacePosition(state, position);

        const events = evaluateBarExit(
          position,
          candle,
          this.config.intrabarConflictPolicy
        );
        position = {
          ...position,
          lastEvaluatedCandleTimestamp: candle.timestamp,
          updatedAt: asOf,
        };
        this.replacePosition(state, position);

        if (events.length > 0) {
          const closedAt = candleCloseTime("M15", candle.timestamp);
          for (const ev of events) {
            const current = state.positions.find((item) => item.id === position.id);
            if (!current || current.status !== "OPEN") break;
            this.applyExitEvent(state, current, ev, closedAt);
          }
          break;
        }
      }
    }
  }

  private consumeExecutions(
    state: PaperStoreState,
    snapshot: ScannerSnapshot,
    asOf: number,
    release: PaperReleaseIdentity | null
  ): void {
    if (!this.config.enabled) return;

    for (const result of snapshot.results) {
      // A paper execution candidate exists only when BOTH the Phase 1 engine
      // decision and the scanner lifecycle are executable. Engine EXECUTE by
      // itself is presentation information, not permission to create an order.
      if (
        result.executionDecision !== "EXECUTE" ||
        result.signalState !== "EXECUTE"
      ) {
        continue;
      }
      if (!result.signalId) continue;

      const executionKey = `paper:${result.signalId}`;
      const existingOrder = state.orders.find(
        (order) => order.executionKey === executionKey
      );

      if (existingOrder) {
        // Phase 4 review exposed a legacy integration bug where an ENGINE
        // EXECUTE + non-EXECUTE lifecycle created a persistent rejected order.
        // That state should never have become a paper order. Reconcile only
        // this exact legacy rejection so a now-valid lifecycle can be processed;
        // every filled order and every genuine paper rejection stays idempotent.
        if (
          existingOrder.status === "REJECTED" &&
          existingOrder.rejectionReason === "PAPER_SIGNAL_STATE_NOT_EXECUTE"
        ) {
          state.orders = state.orders.filter(
            (order) => order.id !== existingOrder.id
          );
        } else {
          continue;
        }
      }

      const rejection = this.validateCandidate(state, result, asOf);
      if (rejection) {
        this.rejectOrder(state, result, executionKey, rejection, asOf, release);
        continue;
      }

      this.openPosition(state, result, executionKey, asOf, release);
    }
  }

  private validateCandidate(
    state: PaperStoreState,
    result: SymbolScanResult,
    asOf: number
  ): string | null {
    const risk = result.riskDetail;
    if (result.status !== "ANALYSED") return "PAPER_UPSTREAM_NOT_ANALYSED";
    if (!result.strategyId) return "PAPER_STRATEGY_UNATTRIBUTED";
    if (result.freshness === "STALE") return "PAPER_MARKET_DATA_NOT_FRESH";
    if (result.freshness === "DELAYED" && !this.config.allowDelayed) {
      return "PAPER_MARKET_DATA_NOT_FRESH";
    }
    if (result.signalState !== "EXECUTE") return "PAPER_SIGNAL_STATE_NOT_EXECUTE";
    if (result.biasDirection !== "LONG" && result.biasDirection !== "SHORT") {
      return "PAPER_DIRECTION_INVALID";
    }
    if (!risk?.approved) return "PAPER_RISK_NOT_APPROVED";

    const required = [
      risk.entryPrice,
      risk.stopLoss,
      risk.stopDistancePips,
      risk.takeProfit1,
      risk.riskCapital,
      risk.riskPercent,
      risk.positionSize,
      risk.pipSize,
    ];
    if (required.some((value) => value === null || !Number.isFinite(value))) {
      return "PAPER_EXECUTION_SNAPSHOT_INCOMPLETE";
    }

    const entry = risk.entryPrice!;
    const stop = risk.stopLoss!;
    const size = risk.positionSize!;
    const riskAmount = risk.riskCapital!;
    const stopPips = risk.stopDistancePips!;
    const pipSize = risk.pipSize!;

    if (entry <= 0 || stop <= 0 || size <= 0 || riskAmount <= 0 || stopPips <= 0 || pipSize <= 0) {
      return "PAPER_EXECUTION_SNAPSHOT_INVALID";
    }
    if (result.biasDirection === "LONG" && stop >= entry) return "PAPER_INVALID_LONG_STOP";
    if (result.biasDirection === "SHORT" && stop <= entry) return "PAPER_INVALID_SHORT_STOP";

    const account = this.accountSummary(state);
    const open = state.positions.filter((position) => position.status === "OPEN");
    if (open.length >= this.config.maxOpenPositions) {
      return "PAPER_MAX_OPEN_POSITIONS";
    }

    const sameSymbolCount = open.filter(
      (position) => position.symbol === result.symbol
    ).length;
    if (sameSymbolCount >= this.config.maxOpenPositionsPerSymbol) {
      return "PAPER_MAX_OPEN_POSITIONS_PER_SYMBOL";
    }

    const exposureBlock = findDirectionalCurrencyExposureBlock(
      open,
      result.symbol,
      result.biasDirection,
      this.config.maxDirectionalCurrencyExposure
    );
    if (exposureBlock) {
      return "PAPER_DIRECTIONAL_CURRENCY_EXPOSURE";
    }

    const lastStop = [...state.trades]
      .filter(
        (trade) =>
          trade.symbol === result.symbol &&
          trade.closeReason === "STOP_LOSS"
      )
      .sort((a, b) => b.closedAt - a.closedAt)[0];
    if (
      lastStop &&
      asOf - lastStop.closedAt < this.config.stopLossReentryCooldownMs
    ) {
      return "PAPER_STOP_LOSS_COOLDOWN";
    }

    const candidateTotalRisk = account.openRiskAmount + riskAmount;
    const candidateTotalRiskPercent =
      account.balance > 0 ? (candidateTotalRisk / account.balance) * 100 : Infinity;
    if (candidateTotalRiskPercent > this.config.maxTotalOpenRiskPercent) {
      return "PAPER_MAX_TOTAL_RISK";
    }

    return null;
  }

  private rejectOrder(
    state: PaperStoreState,
    result: SymbolScanResult,
    executionKey: string,
    reason: string,
    at: number,
    release: PaperReleaseIdentity | null
  ): void {
    if (!result.signalId) return;
    const side: PaperDirection =
      result.biasDirection === "SHORT" ? "SHORT" : "LONG";
    const risk = result.riskDetail;
    const order: PaperOrder = {
      id: `order-${result.signalId}`,
      executionKey,
      signalId: result.signalId,
      symbol: result.symbol,
      side,
      requestedAt: at,
      filledAt: null,
      requestedEntry: risk?.entryPrice ?? result.latestPrice ?? 0,
      fillPrice: null,
      stopLoss: risk?.stopLoss ?? 0,
      takeProfit: risk?.takeProfit1 ?? null,
      positionSize: risk?.positionSize ?? result.positionSize ?? 0,
      riskAmount: risk?.riskCapital ?? 0,
      riskPercent: risk?.riskPercent ?? 0,
      plannedRR: risk?.plannedRR ?? result.riskReward,
      status: "REJECTED",
      rejectionReason: reason,
      engine: this.engineSnapshot(result, release),
    };
    state.orders.push(order);
    state.ledger.push({
      id: `ledger-reject-${result.signalId}`,
      type: "ORDER_REJECTED",
      timestamp: at,
      symbol: result.symbol,
      signalId: result.signalId,
      amount: 0,
      note: reason,
    });
  }

  private openPosition(
    state: PaperStoreState,
    result: SymbolScanResult,
    executionKey: string,
    at: number,
    release: PaperReleaseIdentity | null
  ): void {
    const signalId = result.signalId!;
    const risk = result.riskDetail!;
    const side = result.biasDirection as PaperDirection;
    const entry = risk.entryPrice!;
    const stopPips = risk.stopDistancePips!;
    const size = risk.positionSize!;
    const riskAmount = risk.riskCapital!;
    const pipValuePerLotAccountCurrency = riskAmount / (stopPips * size);

    // TRD-RR-003: the execution plan decides whether this order is a plain
    // single-TP trade or a partial plan. Legacy callers without a plan keep
    // the historical single-TP shape.
    //
    // FULL_OBSTACLE: obstacle in [minObstacleR, closeObstacleMaxR) closes
    // 100% at the obstacle. TP is the obstacle price, not the baseline 2R.
    // PARTIAL: two-leg position with TP1 at the obstacle, TP2 at 2R.
    // FULL_2R / undefined: legacy single TP at risk.takeProfit1.
    const plan = risk.executionPlan ?? null;
    const isPartial = plan?.kind === "PARTIAL";
    const isFullObstacle = plan?.kind === "FULL_OBSTACLE";
    const tp1 = isPartial ? plan.tp1 : null;
    const tp2 = isPartial ? plan.tp2 : null;
    const tp1SizePercent = isPartial ? plan.tp1SizePercent : 0;
    const tp2SizePercent = isPartial ? plan.tp2SizePercent : 100;
    // Legacy single-TP target uses takeProfit1 from the risk snapshot, which
    // for a PARTIAL plan is the second leg target (baseline 2R). For
    // FULL_OBSTACLE the actual take-profit is the obstacle price.
    const legacyTakeProfit = isPartial
      ? tp2
      : isFullObstacle
        ? plan.tp
        : risk.takeProfit1 ?? null;

    const order: PaperOrder = {
      id: `order-${signalId}`,
      executionKey,
      signalId,
      symbol: result.symbol,
      side,
      requestedAt: at,
      filledAt: at,
      requestedEntry: entry,
      fillPrice: entry,
      stopLoss: risk.stopLoss!,
      takeProfit: legacyTakeProfit,
      positionSize: size,
      riskAmount,
      riskPercent: risk.riskPercent!,
      plannedRR: risk.plannedRR ?? null,
      status: "FILLED",
      rejectionReason: null,
      tp1,
      tp2,
      engine: this.engineSnapshot(result, release),
    };

    const position: PaperPosition = {
      id: `position-${signalId}`,
      orderId: order.id,
      signalId,
      symbol: result.symbol,
      side,
      entryPrice: entry,
      currentPrice: entry,
      stopLoss: risk.stopLoss!,
      takeProfit: legacyTakeProfit,
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
      tp1,
      tp1SizePercent,
      tp1HitAt: null,
      tp2,
      tp2SizePercent,
      tp2HitAt: null,
      remainingSize: size,
      realizedPnL: 0,
      engine: order.engine,
    };

    state.orders.push(order);
    state.positions.push(position);
    state.ledger.push({
      id: `ledger-open-${signalId}`,
      type: "TRADE_OPENED",
      timestamp: at,
      symbol: result.symbol,
      signalId,
      amount: -riskAmount,
      note: `Paper ${side} opened at ${entry}; risk reserved for analytics only.`,
    });
  }

  /**
   * TRD-RR-003: dispatch one exit event from the calculator. Partial events
   * book a leg and keep the position open; full events close the position.
   */
  private applyExitEvent(
    state: PaperStoreState,
    position: PaperPosition,
    decision: ExitDecision,
    closedAt: number
  ): void {
    if (decision.reason === "PARTIAL_TAKE_PROFIT") {
      this.closePartial(state, position, decision, closedAt);
      return;
    }
    this.closePosition(state, position, decision, closedAt);
  }

  /**
   * TRD-RR-003: close a fraction of an open position and keep the remainder
   * open for the next leg. Updates remainingSize, realizedPnL, tp1HitAt and
   * records a TRADE_PARTIALLY_CLOSED ledger event. Idempotent: if tp1HitAt
   * is already set, this is a no-op.
   */
  private closePartial(
    state: PaperStoreState,
    position: PaperPosition,
    decision: ExitDecision,
    closedAt: number
  ): void {
    const current = state.positions.find((item) => item.id === position.id);
    if (!current || current.status !== "OPEN") return;
    if (current.tp1HitAt != null) return;

    const legSize = current.positionSize * decision.sizeFraction;
    if (!(legSize > 0)) return;

    const legPnL = calculatePnl({
      side: current.side,
      entryPrice: current.entryPrice,
      exitPrice: decision.exitPrice,
      pipSize: current.pipSize,
      positionSize: legSize,
      pipValuePerLotAccountCurrency: current.pipValuePerLotAccountCurrency,
    });

    const remainingSize = Math.max(0, (current.remainingSize ?? current.positionSize) - legSize);
    const realizedPnL = (current.realizedPnL ?? 0) + legPnL;

    this.replacePosition(state, {
      ...current,
      tp1HitAt: closedAt,
      remainingSize,
      realizedPnL,
      currentPrice: decision.exitPrice,
      updatedAt: closedAt,
    });

    state.ledger.push({
      id: `ledger-partial-${current.signalId}-tp1`,
      type: "TRADE_PARTIALLY_CLOSED",
      timestamp: closedAt,
      symbol: current.symbol,
      signalId: current.signalId,
      amount: legPnL,
      note: `PARTIAL_TAKE_PROFIT at ${decision.exitPrice}; leg size ${legSize}; remaining ${remainingSize}; realized ${legPnL}.`,
    });
  }

  private closePosition(
    state: PaperStoreState,
    position: PaperPosition,
    decision: ExitDecision,
    closedAt: number
  ): void {
    const current = state.positions.find((item) => item.id === position.id);
    if (!current || current.status !== "OPEN") return;

    // TRD-RR-003: the final leg sizes on the OPEN remainder, and the trade
    // record carries the aggregate P&L across every closed leg.
    const openSize = current.remainingSize ?? current.positionSize;
    const legPnL = calculatePnl({
      side: current.side,
      entryPrice: current.entryPrice,
      exitPrice: decision.exitPrice,
      pipSize: current.pipSize,
      positionSize: openSize,
      pipValuePerLotAccountCurrency: current.pipValuePerLotAccountCurrency,
    });
    const totalRealizedPnL = (current.realizedPnL ?? 0) + legPnL;
    const realizedR = calculateR(totalRealizedPnL, current.riskAmount);
    const balanceBefore = this.accountSummary(state).balance;
    const trade: PaperTrade = {
      id: `trade-${current.signalId}`,
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
      realizedPnL: totalRealizedPnL,
      realizedPnLPercent: balanceBefore > 0 ? (totalRealizedPnL / balanceBefore) * 100 : 0,
      realizedR,
      maxFavorableR: current.maxFavorableR ?? Math.max(0, realizedR),
      maxAdverseR: current.maxAdverseR ?? Math.min(0, realizedR),
      openedAt: current.openedAt,
      closedAt,
      holdingDurationMs: Math.max(0, closedAt - current.openedAt),
      closeReason: decision.reason,
      engine: current.engine,
    };

    this.replacePosition(state, {
      ...current,
      currentPrice: decision.exitPrice,
      updatedAt: closedAt,
      status: "CLOSED",
      unrealizedPnL: 0,
      currentR: realizedR,
      remainingSize: 0,
      realizedPnL: totalRealizedPnL,
    });
    if (!state.trades.some((item) => item.id === trade.id)) {
      state.trades.push(trade);
      state.ledger.push({
        id: `ledger-close-${current.signalId}`,
        type: "TRADE_CLOSED",
        timestamp: closedAt,
        symbol: current.symbol,
        signalId: current.signalId,
        amount: legPnL,
        note: `${decision.reason} at ${decision.exitPrice}; final leg PnL ${legPnL}; trade total ${totalRealizedPnL}.`,
      });
    }
  }

  private replacePosition(state: PaperStoreState, position: PaperPosition): void {
    const index = state.positions.findIndex((item) => item.id === position.id);
    if (index >= 0) state.positions[index] = position;
  }

  private engineSnapshot(
    result: SymbolScanResult,
    release: PaperReleaseIdentity | null
  ) {
    return {
      strategyId: result.strategyId ?? null,
      bias: result.bias,
      setupScore: result.setupScore,
      executionDecision: result.executionDecision ?? null,
      freshness: result.freshness ?? null,
      engineVersion: ENGINE_VERSION,
      paperConfigVersion: PAPER_CONFIG_VERSION,
      strategyVersion: release?.strategyVersion ?? null,
      strategyManifestFingerprint:
        release?.strategyManifestFingerprint ?? null,
      strategySourceReportId: release?.strategySourceReportId ?? null,
      strategyActivationAt: release?.strategyActivationAt ?? null,
    };
  }

  private accountSummary(state: PaperStoreState): PaperAccountSummary {
    // TRD-RR-003: closed trades already carry their aggregate P&L. Partial
    // legs on still-open positions are booked here so balance reflects every
    // realized leg exactly once.
    const closedPnL = state.trades.reduce((sum, trade) => sum + trade.realizedPnL, 0);
    const openPositions = state.positions.filter((position) => position.status === "OPEN");
    const partialPnL = openPositions.reduce(
      (sum, position) => sum + (position.realizedPnL ?? 0),
      0
    );
    const realizedPnL = closedPnL + partialPnL;
    const unrealizedPnL = openPositions.reduce(
      (sum, position) => sum + position.unrealizedPnL,
      0
    );
    const balance = state.account.initialBalance + realizedPnL;
    const openRiskAmount = openPositions.reduce(
      (sum, position) => sum + position.riskAmount,
      0
    );
    return {
      currency: state.account.currency,
      initialBalance: state.account.initialBalance,
      balance,
      equity: balance + unrealizedPnL,
      realizedPnL,
      unrealizedPnL,
      openRiskAmount,
      openRiskPercent: balance > 0 ? (openRiskAmount / balance) * 100 : 0,
      openPositionCount: openPositions.length,
      closedTradeCount: state.trades.length,
    };
  }

  private toDashboard(
    state: PaperStoreState,
    persistenceError: string | null
  ): PaperDashboardData {
    return {
      enabled: this.config.enabled,
      config: {
        maxOpenPositions: this.config.maxOpenPositions,
        maxTotalOpenRiskPercent: this.config.maxTotalOpenRiskPercent,
        maxOpenPositionsPerSymbol: this.config.maxOpenPositionsPerSymbol,
        maxDirectionalCurrencyExposure:
          this.config.maxDirectionalCurrencyExposure,
        stopLossReentryCooldownMs: this.config.stopLossReentryCooldownMs,
        intrabarConflictPolicy: this.config.intrabarConflictPolicy,
      },
      account: this.accountSummary(state),
      openPositions: state.positions
        .filter((position) => position.status === "OPEN")
        .sort((a, b) => b.openedAt - a.openedAt),
      recentTrades: [...state.trades].sort((a, b) => b.closedAt - a.closedAt).slice(0, 100),
      recentOrders: [...state.orders].sort((a, b) => b.requestedAt - a.requestedAt).slice(0, 100),
      performance: calculatePerformance(state.trades, state.account.initialBalance),
      persistenceError,
    };
  }

  private unavailableDashboard(error: unknown): PaperDashboardData {
    const message = error instanceof Error ? error.message : String(error);
    const state = this.initialState(Date.now());
    return this.toDashboard(state, message);
  }
}
