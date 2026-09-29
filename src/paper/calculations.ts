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
  return {
    ...position,
    currentPrice,
    updatedAt,
    unrealizedPnL,
    currentR: calculateR(unrealizedPnL, position.riskAmount),
  };
}

export interface ExitDecision {
  exitPrice: number;
  reason: PaperCloseReason;
}

export function evaluatePriceExit(
  position: PaperPosition,
  price: number
): ExitDecision | null {
  if (!finite(price)) return null;

  if (position.side === "LONG") {
    if (price <= position.stopLoss) {
      return { exitPrice: position.stopLoss, reason: "STOP_LOSS" };
    }
    if (position.takeProfit !== null && price >= position.takeProfit) {
      return { exitPrice: position.takeProfit, reason: "TAKE_PROFIT" };
    }
  } else {
    if (price >= position.stopLoss) {
      return { exitPrice: position.stopLoss, reason: "STOP_LOSS" };
    }
    if (position.takeProfit !== null && price <= position.takeProfit) {
      return { exitPrice: position.takeProfit, reason: "TAKE_PROFIT" };
    }
  }
  return null;
}

export function evaluateBarExit(
  position: PaperPosition,
  candle: CanonicalCandle,
  policy: IntrabarConflictPolicy
): ExitDecision | null {
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
