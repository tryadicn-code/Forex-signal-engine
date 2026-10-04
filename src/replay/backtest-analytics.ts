import type {
  HistoricalExecutionSummary,
  HistoricalTrade,
} from "@/replay/execution-types";
import type {
  ComparablePerformance,
  HistoricalAnalyticsOptions,
  HistoricalBacktestAnalytics,
  HistoricalCurvePoint,
  HistoricalForwardComparison,
  HistoricalRDistributionBin,
  HistoricalSegmentPerformance,
  HistoricalSessionBucket,
} from "@/replay/analytics-types";

export const DEFAULT_HISTORICAL_SESSION_BUCKETS: HistoricalSessionBucket[] = [
  { key: "ASIA", label: "Asia · 00–08 UTC", startHourUtc: 0, endHourUtc: 8 },
  { key: "LONDON", label: "London · 08–13 UTC", startHourUtc: 8, endHourUtc: 13 },
  { key: "OVERLAP", label: "London/NY overlap · 13–17 UTC", startHourUtc: 13, endHourUtc: 17 },
  { key: "NEW_YORK", label: "New York · 17–22 UTC", startHourUtc: 17, endHourUtc: 22 },
  { key: "LATE", label: "Late · 22–24 UTC", startHourUtc: 22, endHourUtc: 24 },
];

export function calculateHistoricalAnalytics(
  execution: HistoricalExecutionSummary,
  options: HistoricalAnalyticsOptions = {}
): HistoricalBacktestAnalytics {
  const trades = [...execution.trades].sort(
    (a, b) => a.closedAt - b.closedAt || a.id.localeCompare(b.id)
  );
  const wins = trades.filter((trade) => trade.realizedPnL > 0);
  const losses = trades.filter((trade) => trade.realizedPnL < 0);
  const breakEven = trades.length - wins.length - losses.length;
  const sampleSize = trades.length;

  const grossProfit = sum(wins.map((trade) => trade.realizedPnL));
  const grossLoss = sum(losses.map((trade) => trade.realizedPnL));
  const netPnL = sum(trades.map((trade) => trade.realizedPnL));
  const netR = sum(trades.map((trade) => trade.realizedR));

  const averageWin = average(wins.map((trade) => trade.realizedPnL));
  const averageLoss = average(losses.map((trade) => Math.abs(trade.realizedPnL)));
  const winRate = sampleSize > 0 ? (wins.length / sampleSize) * 100 : null;
  const lossRate = sampleSize > 0 ? (losses.length / sampleSize) * 100 : null;
  const profitFactor =
    grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null;
  const payoffRatio =
    averageWin !== null && averageLoss !== null && averageLoss > 0
      ? averageWin / averageLoss
      : null;
  const expectancyAmount =
    sampleSize === 0
      ? null
      : ((winRate ?? 0) / 100) * (averageWin ?? 0) -
        ((lossRate ?? 0) / 100) * (averageLoss ?? 0);

  const rValues = trades.map((trade) => trade.realizedR);
  const holdingTimes = trades.map((trade) => trade.holdingDurationMs);
  const curve = buildHistoricalCurve(execution);
  const equityDrawdown = maxDrawdown(curve, "equity");
  const balanceDrawdown = maxDrawdown(curve, "balance");
  const currentCurve = curve[curve.length - 1] ?? null;
  const streaks = consecutiveStreaks(trades);

  const sessionBuckets =
    options.sessionBuckets ?? DEFAULT_HISTORICAL_SESSION_BUCKETS;
  validateSessionBuckets(sessionBuckets);

  return {
    sampleSize,
    wins: wins.length,
    losses: losses.length,
    breakEven,
    winRate,
    lossRate,

    initialBalance: execution.initialBalance,
    finalBalance: execution.balance,
    netPnL,
    netReturnPercent:
      execution.initialBalance > 0
        ? (netPnL / execution.initialBalance) * 100
        : 0,

    grossProfit,
    grossLoss,
    averageWin,
    averageLoss,
    payoffRatio,
    profitFactor,
    expectancyAmount,

    netR,
    averageR: average(rValues),
    medianR: median(rValues),
    standardDeviationR: populationStandardDeviation(rValues),
    // M4-5: expectancyR is mathematically equal to averageR when break-even
    // trades contribute 0R (which they always do). It is kept as a distinct
    // field because its name communicates the classical expectancy intent
    // (P(win)*E[R|win] + P(loss)*E[R|loss]) and downstream consumers already
    // depend on it. The explicit win/loss formula below makes the intent
    // auditable and would diverge from averageR only if break-even handling
    // ever changed.
    expectancyR: classicalExpectancyR(wins, losses, rValues),
    // NEW: per-trade Sharpe and Sortino on R values. These are NOT
    // annualized; they compare strategies on a per-trade risk-adjusted basis.
    sharpeR: computeSharpeR(rValues),
    sortinoR: computeSortinoR(rValues),
    bestTradePnL:
      sampleSize > 0
        ? Math.max(...trades.map((trade) => trade.realizedPnL))
        : null,
    worstTradePnL:
      sampleSize > 0
        ? Math.min(...trades.map((trade) => trade.realizedPnL))
        : null,
    bestTradeR: sampleSize > 0 ? Math.max(...rValues) : null,
    worstTradeR: sampleSize > 0 ? Math.min(...rValues) : null,

    averageHoldingTimeMs: average(holdingTimes),
    medianHoldingTimeMs: median(holdingTimes),
    consecutiveWins: streaks.wins,
    consecutiveLosses: streaks.losses,

    maxEquityDrawdownAmount: equityDrawdown.amount,
    maxEquityDrawdownPercent: equityDrawdown.percent,
    maxEquityDrawdownAt: equityDrawdown.at,
    currentEquityDrawdownAmount: currentCurve?.drawdownAmount ?? 0,
    currentEquityDrawdownPercent: currentCurve?.drawdownPercent ?? 0,

    maxBalanceDrawdownAmount: balanceDrawdown.amount,
    maxBalanceDrawdownPercent: balanceDrawdown.percent,
    maxBalanceDrawdownAt: balanceDrawdown.at,

    equityCurve: curve,
    rDistribution: buildRDistribution(rValues),
    segments: {
      byStrategy: segmentTrades(trades, (trade) => ({
        key: trade.engine.strategyId ?? "LEGACY_UNKNOWN",
        label: trade.engine.strategyId ?? "Legacy / unknown strategy",
      })),
      bySymbol: segmentTrades(trades, (trade) => ({
        key: trade.symbol,
        label: trade.symbol,
      })),
      byDirection: segmentTrades(trades, (trade) => ({
        key: trade.side,
        label: trade.side,
      })),
      byBias: segmentTrades(trades, (trade) => ({
        key: trade.engine.bias ?? "UNKNOWN",
        label: trade.engine.bias ?? "Unknown bias",
      })),
      bySetupScore: segmentTrades(trades, (trade) => setupScoreBucket(trade.engine.setupScore)),
      byEntrySession: segmentTrades(trades, (trade) =>
        sessionBucket(trade.openedAt, sessionBuckets)
      ),
      byCloseReason: segmentTrades(trades, (trade) => ({
        key: trade.closeReason,
        label: trade.closeReason,
      })),
    },
  };
}

export function toComparableHistoricalPerformance(
  analytics: HistoricalBacktestAnalytics
): ComparablePerformance {
  return {
    sampleSize: analytics.sampleSize,
    winRate: analytics.winRate,
    profitFactor: analytics.profitFactor,
    expectancyR: analytics.expectancyR,
    averageR: analytics.averageR,
    sharpeR: analytics.sharpeR ?? null,
    sortinoR: analytics.sortinoR ?? null,
    maxDrawdownPercent: analytics.maxEquityDrawdownPercent,
    netReturnPercent: analytics.netReturnPercent,
  };
}

/**
 * Pure comparison helper. It accepts an already-normalized forward summary and
 * never reads the Phase 4 paper store, preserving historical/forward isolation.
 */
export function compareHistoricalToForward(
  historical: ComparablePerformance,
  forward: ComparablePerformance
): HistoricalForwardComparison {
  return {
    historical: { ...historical },
    forward: { ...forward },
    delta: {
      sampleSize: forward.sampleSize - historical.sampleSize,
      winRate: nullableDelta(forward.winRate, historical.winRate),
      profitFactor: nullableDelta(forward.profitFactor, historical.profitFactor),
      expectancyR: nullableDelta(forward.expectancyR, historical.expectancyR),
      averageR: nullableDelta(forward.averageR, historical.averageR),
      sharpeR: nullableDelta(forward.sharpeR ?? null, historical.sharpeR ?? null),
      sortinoR: nullableDelta(forward.sortinoR ?? null, historical.sortinoR ?? null),
      maxDrawdownPercent:
        forward.maxDrawdownPercent - historical.maxDrawdownPercent,
      netReturnPercent:
        forward.netReturnPercent - historical.netReturnPercent,
    },
  };
}

function buildHistoricalCurve(
  execution: HistoricalExecutionSummary
): HistoricalCurvePoint[] {
  const raw = [...execution.equityCurve].sort((a, b) => a.asOf - b.asOf);
  if (raw.length === 0) return [];

  let peakEquity = execution.initialBalance;
  let peakBalance = execution.initialBalance;

  return raw.map((point) => {
    peakEquity = Math.max(peakEquity, point.equity);
    peakBalance = Math.max(peakBalance, point.balance);
    const drawdownAmount = Math.max(0, peakEquity - point.equity);
    const balanceDrawdownAmount = Math.max(0, peakBalance - point.balance);
    return {
      ...point,
      peakEquity,
      drawdownAmount,
      drawdownPercent:
        peakEquity > 0 ? (drawdownAmount / peakEquity) * 100 : 0,
      peakBalance,
      balanceDrawdownAmount,
      balanceDrawdownPercent:
        peakBalance > 0 ? (balanceDrawdownAmount / peakBalance) * 100 : 0,
    };
  });
}

function maxDrawdown(
  curve: HistoricalCurvePoint[],
  kind: "equity" | "balance"
): { amount: number; percent: number; at: number | null } {
  let amount = 0;
  let percent = 0;
  let at: number | null = null;

  for (const point of curve) {
    const pointAmount =
      kind === "equity"
        ? point.drawdownAmount
        : point.balanceDrawdownAmount;
    const pointPercent =
      kind === "equity"
        ? point.drawdownPercent
        : point.balanceDrawdownPercent;
    if (
      pointPercent > percent + 1e-12 ||
      (Math.abs(pointPercent - percent) <= 1e-12 && pointAmount > amount)
    ) {
      amount = pointAmount;
      percent = pointPercent;
      at = point.asOf;
    }
  }

  return { amount, percent, at };
}

function buildRDistribution(values: number[]): HistoricalRDistributionBin[] {
  const bins = [
    {
      key: "LTE_NEG_1",
      label: "≤ -1R",
      minInclusive: null,
      maxExclusive: -1,
      matches: (value: number) => value <= -1,
    },
    {
      key: "NEG_1_TO_0",
      label: "-1R to 0R",
      minInclusive: -1,
      maxExclusive: 0,
      matches: (value: number) => value > -1 && value < 0,
    },
    {
      key: "ZERO_TO_1",
      label: "0R to 1R",
      minInclusive: 0,
      maxExclusive: 1,
      matches: (value: number) => value >= 0 && value < 1,
    },
    {
      key: "ONE_TO_2",
      label: "1R to 2R",
      minInclusive: 1,
      maxExclusive: 2,
      matches: (value: number) => value >= 1 && value < 2,
    },
    {
      key: "GTE_2",
      label: "≥ 2R",
      minInclusive: 2,
      maxExclusive: null,
      matches: (value: number) => value >= 2,
    },
  ];

  return bins.map((bin) => {
    const count = values.filter(bin.matches).length;
    return {
      key: bin.key,
      label: bin.label,
      minInclusive: bin.minInclusive,
      maxExclusive: bin.maxExclusive,
      count,
      percent: values.length > 0 ? (count / values.length) * 100 : 0,
    };
  });
}

function segmentTrades(
  trades: HistoricalTrade[],
  classify: (trade: HistoricalTrade) => { key: string; label: string }
): HistoricalSegmentPerformance[] {
  const groups = new Map<string, { label: string; trades: HistoricalTrade[] }>();

  for (const trade of trades) {
    const classification = classify(trade);
    const existing = groups.get(classification.key);
    if (existing) {
      existing.trades.push(trade);
    } else {
      groups.set(classification.key, {
        label: classification.label,
        trades: [trade],
      });
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => segmentPerformance(key, group.label, group.trades))
    .sort((a, b) => b.sampleSize - a.sampleSize || a.key.localeCompare(b.key));
}

function segmentPerformance(
  key: string,
  label: string,
  trades: HistoricalTrade[]
): HistoricalSegmentPerformance {
  const wins = trades.filter((trade) => trade.realizedPnL > 0);
  const losses = trades.filter((trade) => trade.realizedPnL < 0);
  const breakEven = trades.length - wins.length - losses.length;
  const grossProfit = sum(wins.map((trade) => trade.realizedPnL));
  const grossLoss = sum(losses.map((trade) => trade.realizedPnL));
  const rValues = trades.map((trade) => trade.realizedR);

  return {
    key,
    label,
    sampleSize: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakEven,
    winRate:
      trades.length > 0 ? (wins.length / trades.length) * 100 : null,
    netPnL: sum(trades.map((trade) => trade.realizedPnL)),
    netR: sum(rValues),
    averageR: average(rValues),
    expectancyR: average(rValues),
    profitFactor:
      grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null,
  };
}

function setupScoreBucket(score: number | null): { key: string; label: string } {
  if (score === null || !Number.isFinite(score)) {
    return { key: "UNKNOWN", label: "Unknown setup score" };
  }
  if (score < 70) return { key: "LT_70", label: "< 70" };
  if (score < 80) return { key: "70_79", label: "70–79" };
  if (score < 90) return { key: "80_89", label: "80–89" };
  return { key: "GTE_90", label: "90+" };
}

function sessionBucket(
  timestamp: number,
  buckets: HistoricalSessionBucket[]
): { key: string; label: string } {
  const hour = new Date(timestamp).getUTCHours();
  const match = buckets.find(
    (bucket) => hour >= bucket.startHourUtc && hour < bucket.endHourUtc
  );
  return match
    ? { key: match.key, label: match.label }
    : { key: "UNCLASSIFIED", label: "Unclassified" };
}

function validateSessionBuckets(buckets: HistoricalSessionBucket[]): void {
  for (const bucket of buckets) {
    if (
      !bucket.key.trim() ||
      !bucket.label.trim() ||
      !Number.isInteger(bucket.startHourUtc) ||
      !Number.isInteger(bucket.endHourUtc) ||
      bucket.startHourUtc < 0 ||
      bucket.startHourUtc > 23 ||
      bucket.endHourUtc <= 0 ||
      bucket.endHourUtc > 24 ||
      bucket.endHourUtc <= bucket.startHourUtc
    ) {
      throw new Error("Historical session buckets must use valid UTC hour ranges.");
    }
  }
}

function consecutiveStreaks(
  trades: HistoricalTrade[]
): { wins: number; losses: number } {
  let winRun = 0;
  let lossRun = 0;
  let wins = 0;
  let losses = 0;

  for (const trade of trades) {
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
    wins = Math.max(wins, winRun);
    losses = Math.max(losses, lossRun);
  }

  return { wins, losses };
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function populationStandardDeviation(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = average(values)!;
  const variance =
    sum(values.map((value) => (value - mean) ** 2)) / values.length;
  return Math.sqrt(variance);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function nullableDelta(
  forward: number | null,
  historical: number | null
): number | null {
  return forward === null || historical === null ? null : forward - historical;
}


/**
 * Classical expectancy in R units:
 *   E[R] = P(win) * E[R | win] + P(loss) * E[R | loss]
 *
 * Mathematically equivalent to averageR when break-even trades contribute 0R.
 * Kept as an explicit formula so the win/loss breakdown stays visible.
 */
function classicalExpectancyR(
  wins: HistoricalTrade[],
  losses: HistoricalTrade[],
  allRValues: number[]
): number | null {
  if (allRValues.length === 0) return null;
  const n = allRValues.length;
  const winR = wins.map((t) => t.realizedR);
  const lossR = losses.map((t) => t.realizedR);
  const pWin = winR.length / n;
  const pLoss = lossR.length / n;
  const eWin = winR.length > 0 ? sum(winR) / winR.length : 0;
  const eLoss = lossR.length > 0 ? sum(lossR) / lossR.length : 0;
  return pWin * eWin + pLoss * eLoss;
}

/**
 * Per-trade Sharpe: mean(R) / populationStdDev(R). Not annualized.
 * Returns null when the sample has no variance (stdDev = 0) or is empty.
 */
function computeSharpeR(rValues: number[]): number | null {
  if (rValues.length === 0) return null;
  const mean = average(rValues);
  const sd = populationStandardDeviation(rValues);
  if (mean === null || sd === null || sd === 0) return null;
  return mean / sd;
}

/**
 * Per-trade Sortino: mean(R) / downsideDeviation(R), where downsideDeviation
 * is the population standard deviation of non-positive R values. Not
 * annualized. Returns null when there are no losing trades (no downside).
 */
function computeSortinoR(rValues: number[]): number | null {
  if (rValues.length === 0) return null;
  const mean = average(rValues);
  if (mean === null) return null;
  const downside = rValues.filter((r) => r < 0);
  if (downside.length === 0) return null;
  const downsideVariance =
    sum(downside.map((r) => r * r)) / rValues.length;
  const downsideDev = Math.sqrt(downsideVariance);
  if (downsideDev === 0) return null;
  return mean / downsideDev;
}