import type {
  ComparablePerformance,
  HistoricalBacktestAnalytics,
  HistoricalSegmentDimension,
  HistoricalSegmentPerformance,
} from "@/replay/analytics-types";
import type { PaperDashboardData } from "@/paper/types";

export function toComparablePaperPerformance(
  paper: PaperDashboardData
): ComparablePerformance {
  const initialBalance = paper.account.initialBalance;
  return {
    sampleSize: paper.performance.totalTrades,
    winRate: paper.performance.winRate,
    profitFactor: paper.performance.profitFactor,
    expectancyR: paper.performance.expectancyR,
    averageR: paper.performance.averageR,
    maxDrawdownPercent: paper.performance.maxDrawdownPercent,
    netReturnPercent:
      initialBalance > 0
        ? (paper.performance.netPnL / initialBalance) * 100
        : 0,
  };
}

export function getHistoricalSegmentRows(
  analytics: HistoricalBacktestAnalytics,
  dimension: HistoricalSegmentDimension
): HistoricalSegmentPerformance[] {
  switch (dimension) {
    case "symbol":
      return analytics.segments.bySymbol;
    case "direction":
      return analytics.segments.byDirection;
    case "bias":
      return analytics.segments.byBias;
    case "setupScore":
      return analytics.segments.bySetupScore;
    case "entrySession":
      return analytics.segments.byEntrySession;
    case "closeReason":
      return analytics.segments.byCloseReason;
    default: {
      const exhaustive: never = dimension;
      return exhaustive;
    }
  }
}

export function segmentDimensionLabel(
  dimension: HistoricalSegmentDimension
): string {
  switch (dimension) {
    case "symbol":
      return "Pair";
    case "direction":
      return "Direction";
    case "bias":
      return "Bias";
    case "setupScore":
      return "Setup score";
    case "entrySession":
      return "Entry session";
    case "closeReason":
      return "Close reason";
  }
}
