import type { CanonicalCandle } from "@/types/market-data";
import type { IntrabarConflictPolicy } from "@/config/paper";
import type {
  PaperCloseReason,
  PaperDirection,
  PaperPerformance,
  PaperPosition,
  PaperTrade,
} from "@/paper/types";

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function calculatePnl(input: {
  side: PaperDirection;
  entryPrice: number;
  exitPrice: number;
  pipSize: number;
  positionSize: number;
  pipValuePerLotAccountCurrency: number;
}): number {
  if (
    !finite(input.entryPrice) ||
    !finite(input.exitPrice) ||
    !finite(input.pipSize) ||
    input.pipSize <= 0 ||
    !finite(input.positionSize) ||
    input.positionSize <= 0 ||
    !finite(input.pipValuePerLotAccountCurrency) ||
    input.pipValuePerLotAccountCurrency <= 0
  ) {
    return 0;
  }

  const direction = input.side === "LONG" ? 1 : -1;
  const pips = ((input.exitPrice - input.entryPrice) * direction) / input.pipSize;
  return pips * input.pipValuePerLotAccountCurrency * input.positionSize;
}

export function calculateR(pnl: number, riskAmount: number): number {
  if (!finite(pnl) || !finite(riskAmount) || riskAmount <= 0) return 0;
  return pnl / riskAmount;
}

export function markPosition(
  position: PaperPosition,
  currentPrice: number,
  updatedAt: number
): PaperPosition {
  const unrealizedPnL = calculatePnl({
    side: position.side,
    entryPrice: position.entryPrice,
    exitPrice: currentPrice,
    pipSize: position.pipSize,
    positionSize: position.positionSize,
    pipValuePerLotAccountCurrency: position.pipValuePerLotAccountCurrency,
  });
  const currentR = calculateR(unrealizedPnL, position.riskAmount);
  return {
    ...position,
    currentPrice,
    updatedAt,
    unrealizedPnL,
    currentR,
    maxFavorableR: Math.max(position.maxFavorableR ?? 0, currentR),
    maxAdverseR: Math.min(position.maxAdverseR ?? 0, currentR),
  };
}

export function markPositionExcursion(
  position: PaperPosition,
  candle: CanonicalCandle,
  updatedAt: number
): PaperPosition {
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

export interface ExitDecision {
  exitPrice: number;
  reason: PaperCloseReason;
  /**
   * TRD-RR-003: fraction of the ORIGINAL position size closed by this leg.
   * 1.0 for full closes (STOP_LOSS, TAKE_PROFIT, MANUAL, AMBIGUOUS), and
   * tp1SizePercent/100 for the partial TP1 leg of a PARTIAL plan.
   */
  sizeFraction: number;
}

/**
 * TRD-RR-003: evaluate live price against a position and return the list of
 * exit events that have fired. STOP_LOSS always wins when it is on the wrong
 * side of price, matching the historical conservative ordering.
 *
 * Return contract:
 *   - []                  nothing fired
 *   - [FULL leg]          STOP_LOSS, legacy single-TP, or PARTIAL TP1 with
 *                         tp1SizePercent = 100 (obstacle at full close)
 *   - [PARTIAL, FULL]     PARTIAL TP1 hit and TP2 also reached on this price
 *   - [PARTIAL]           PARTIAL TP1 hit, TP2 still pending
 */
export function evaluatePriceExit(
  position: PaperPosition,
  price: number
): ExitDecision[] {
  if (!finite(price)) return [];

  const long = position.side === "LONG";
  const tp1 = position.tp1 ?? null;
  const tp2 = position.tp2 ?? null;
  const legacyTp = position.takeProfit;
  const tp1Hit = position.tp1HitAt != null;
  const tp1FractionRaw = (position.tp1SizePercent ?? 0) / 100;
  const tp1Fraction = tp1FractionRaw > 0 && tp1FractionRaw < 1 ? tp1FractionRaw : 0.5;

  // 1) STOP LOSS — always wins when touched.
  const stopTouched = long
    ? price <= position.stopLoss
    : price >= position.stopLoss;
  if (stopTouched) {
    return [{ exitPrice: position.stopLoss, reason: "STOP_LOSS", sizeFraction: 1 }];
  }

  // 2) TP1 partial leg.
  if (tp1 !== null && !tp1Hit) {
    const tp1Touched = long ? price >= tp1 : price <= tp1;
    if (tp1Touched) {
      const events: ExitDecision[] = [
        {
          exitPrice: tp1,
          reason: "PARTIAL_TAKE_PROFIT",
          sizeFraction: tp1Fraction,
        },
      ];
      if (tp2 !== null) {
        const tp2Touched = long ? price >= tp2 : price <= tp2;
        if (tp2Touched) {
          events.push({
            exitPrice: tp2,
            reason: "TAKE_PROFIT",
            sizeFraction: 1 - tp1Fraction,
          });
        }
      }
      return events;
    }
  }

  // 3) TP2 (or legacy single-TP) final leg.
  const finalTp = tp2 ?? legacyTp;
  if (finalTp !== null) {
    const finalTouched = long ? price >= finalTp : price <= finalTp;
    if (finalTouched) {
      // Price jumped past TP1 to TP2 without an intermediate observation.
      // Book TP1 at the TP1 level, then the remaining fraction at TP2.
      if (tp1 !== null && !tp1Hit) {
        return [
          {
            exitPrice: tp1,
            reason: "PARTIAL_TAKE_PROFIT",
            sizeFraction: tp1Fraction,
          },
          {
            exitPrice: finalTp,
            reason: "TAKE_PROFIT",
            sizeFraction: 1 - tp1Fraction,
          },
        ];
      }
      return [
        { exitPrice: finalTp, reason: "TAKE_PROFIT", sizeFraction: 1 },
      ];
    }
  }

  return [];
}

/**
 * TRD-RR-003: evaluate a closed bar against a position and return the list
 * of exit events that fired inside the bar. Ordering follows the existing
 * intrabar conflict policy when STOP and TP overlap.
 *
 * TP1 + TP2 in the same bar is not a conflict: it means price ran through
 * both levels, so we emit a partial TP1 leg then a final TP2 leg.
 */
export function evaluateBarExit(
  position: PaperPosition,
  candle: CanonicalCandle,
  policy: IntrabarConflictPolicy
): ExitDecision[] {
  const long = position.side === "LONG";
  const tp1 = position.tp1 ?? null;
  const tp2 = position.tp2 ?? null;
  const legacyTp = position.takeProfit;
  const tp1Hit = position.tp1HitAt != null;
  const tp1FractionRaw = (position.tp1SizePercent ?? 0) / 100;
  const tp1Fraction = tp1FractionRaw > 0 && tp1FractionRaw < 1 ? tp1FractionRaw : 0.5;

  const stopTouched = long
    ? candle.low <= position.stopLoss
    : candle.high >= position.stopLoss;

  const tp1Touched =
    tp1 !== null && !tp1Hit && (long ? candle.high >= tp1 : candle.low <= tp1);

  const finalTp = tp2 ?? legacyTp;
  const finalTouched =
    finalTp !== null && (long ? candle.high >= finalTp : candle.low <= finalTp);

  // 1) STOP vs TP ambiguity — bar touched both stop and any target.
  if (stopTouched && (tp1Touched || finalTouched)) {
    if (policy === "REJECT_AMBIGUOUS") {
      return [{ exitPrice: position.stopLoss, reason: "AMBIGUOUS_BAR", sizeFraction: 1 }];
    }
    if (policy === "TARGET_FIRST" && finalTouched && finalTp !== null) {
      // Honour the policy but still emit the partial leg first when relevant.
      if (tp1 !== null && !tp1Hit) {
        return [
          { exitPrice: tp1, reason: "PARTIAL_TAKE_PROFIT", sizeFraction: tp1Fraction },
          { exitPrice: finalTp, reason: "TAKE_PROFIT", sizeFraction: 1 - tp1Fraction },
        ];
      }
      return [{ exitPrice: finalTp, reason: "TAKE_PROFIT", sizeFraction: 1 }];
    }
    return [{ exitPrice: position.stopLoss, reason: "STOP_LOSS", sizeFraction: 1 }];
  }

  if (stopTouched) {
    return [{ exitPrice: position.stopLoss, reason: "STOP_LOSS", sizeFraction: 1 }];
  }

  // 2) TP1 and/or TP2 without stop interference.
  if (tp1Touched && finalTouched && finalTp !== null && tp1 !== null) {
    return [
      { exitPrice: tp1, reason: "PARTIAL_TAKE_PROFIT", sizeFraction: tp1Fraction },
      { exitPrice: finalTp, reason: "TAKE_PROFIT", sizeFraction: 1 - tp1Fraction },
    ];
  }

  if (tp1Touched && tp1 !== null) {
    return [
      { exitPrice: tp1, reason: "PARTIAL_TAKE_PROFIT", sizeFraction: tp1Fraction },
    ];
  }

  if (finalTouched && finalTp !== null) {
    return [{ exitPrice: finalTp, reason: "TAKE_PROFIT", sizeFraction: 1 }];
  }

  return [];
}

export function calculatePerformance(
  trades: PaperTrade[],
  initialBalance: number
): PaperPerformance {
  const ordered = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  const wins = ordered.filter((trade) => trade.realizedPnL > 0);
  const losses = ordered.filter((trade) => trade.realizedPnL < 0);
  const breakEven = ordered.length - wins.length - losses.length;
  const grossProfit = wins.reduce((sum, trade) => sum + trade.realizedPnL, 0);
  const grossLoss = losses.reduce((sum, trade) => sum + trade.realizedPnL, 0);
  const netPnL = grossProfit + grossLoss;
  const totalTrades = ordered.length;

  const average = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

  const rValues = ordered.map((trade) => trade.realizedR);
  const sortedR = [...rValues].sort((a, b) => a - b);
  const medianR =
    sortedR.length === 0
      ? null
      : sortedR.length % 2 === 1
        ? sortedR[Math.floor(sortedR.length / 2)]
        : (sortedR[sortedR.length / 2 - 1] + sortedR[sortedR.length / 2]) / 2;

  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdownAmount = 0;
  let maxDrawdownPercent = 0;
  let winRun = 0;
  let lossRun = 0;
  let consecutiveWins = 0;
  let consecutiveLosses = 0;

  for (const trade of ordered) {
    balance += trade.realizedPnL;
    if (balance > peak) peak = balance;
    const drawdown = Math.max(0, peak - balance);
    const drawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
    maxDrawdownAmount = Math.max(maxDrawdownAmount, drawdown);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);

    if (trade.realizedPnL > 0) {
      winRun += 1;
      lossRun = 0;
    } else if (trade.realizedPnL < 0) {
      lossRun += 1;
      winRun = 0;
    } else {
      winRun = 0;
      lossRun = 0;
    }
    consecutiveWins = Math.max(consecutiveWins, winRun);
    consecutiveLosses = Math.max(consecutiveLosses, lossRun);
  }

  const currentDrawdownAmount = Math.max(0, peak - balance);
  const currentDrawdownPercent = peak > 0 ? (currentDrawdownAmount / peak) * 100 : 0;
  const averageWin = average(wins.map((trade) => trade.realizedPnL));
  const averageLoss = average(losses.map((trade) => Math.abs(trade.realizedPnL)));
  const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : null;
  const lossRate = totalTrades > 0 ? (losses.length / totalTrades) * 100 : null;
  const profitFactor = grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null;
  const expectancy =
    totalTrades === 0
      ? null
      : ((winRate ?? 0) / 100) * (averageWin ?? 0) -
        ((lossRate ?? 0) / 100) * (averageLoss ?? 0);

  return {
    totalTrades,
    wins: wins.length,
    losses: losses.length,
    breakEven,
    winRate,
    lossRate,
    grossProfit,
    grossLoss,
    netPnL,
    averageWin,
    averageLoss,
    averageR: average(rValues),
    medianR,
    profitFactor,
    expectancy,
    expectancyR: average(rValues),
    maxDrawdownAmount,
    maxDrawdownPercent,
    currentDrawdownAmount,
    currentDrawdownPercent,
    bestTrade: totalTrades > 0 ? Math.max(...ordered.map((trade) => trade.realizedPnL)) : null,
    worstTrade: totalTrades > 0 ? Math.min(...ordered.map((trade) => trade.realizedPnL)) : null,
    averageHoldingTimeMs: average(ordered.map((trade) => trade.holdingDurationMs)),
    consecutiveWins,
    consecutiveLosses,
  };
}
