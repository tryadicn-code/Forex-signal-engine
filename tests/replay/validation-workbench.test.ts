import { describe, expect, it } from "vitest";
import {
  getHistoricalSegmentRows,
  segmentDimensionLabel,
  toComparablePaperPerformance,
} from "@/replay/validation-workbench";
import type { HistoricalBacktestAnalytics } from "@/replay/analytics-types";
import type { PaperDashboardData } from "@/paper/types";

describe("Phase 5.5 validation workbench helpers", () => {
  it("normalizes Phase 4 paper performance without reading paper storage", () => {
    const paper = {
      account: {
        initialBalance: 10_000,
      },
      performance: {
        totalTrades: 20,
        winRate: 55,
        profitFactor: 1.7,
        expectancyR: 0.22,
        averageR: 0.22,
        maxDrawdownPercent: 4.5,
        netPnL: 800,
      },
    } as PaperDashboardData;

    expect(toComparablePaperPerformance(paper)).toEqual({
      sampleSize: 20,
      winRate: 55,
      profitFactor: 1.7,
      expectancyR: 0.22,
      averageR: 0.22,
      maxDrawdownPercent: 4.5,
      netReturnPercent: 8,
    });
  });

  it("selects the requested historical segment without recomputing trades", () => {
    const row = {
      key: "EURUSD",
      label: "EURUSD",
      sampleSize: 12,
      wins: 7,
      losses: 5,
      breakEven: 0,
      winRate: 58.33,
      netPnL: 120,
      netR: 2.4,
      averageR: 0.2,
      expectancyR: 0.2,
      profitFactor: 1.4,
    };
    const analytics = {
      segments: {
        bySymbol: [row],
        byDirection: [],
        byBias: [],
        bySetupScore: [],
        byEntrySession: [],
        byCloseReason: [],
      },
    } as unknown as HistoricalBacktestAnalytics;

    expect(getHistoricalSegmentRows(analytics, "symbol")).toEqual([row]);
    expect(getHistoricalSegmentRows(analytics, "direction")).toEqual([]);
    expect(segmentDimensionLabel("entrySession")).toBe("Entry session");
  });
});
