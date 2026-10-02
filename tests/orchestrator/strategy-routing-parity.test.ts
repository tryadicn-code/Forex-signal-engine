import { describe, expect, it } from "vitest";
import type { AnalysisContext } from "@/core/orchestrator";
import {
  analyzeMarket,
  analyzeMarketWithRouting,
} from "@/core/orchestrator";
import { analyzeTrendPullback } from "@/core/strategies";
import {
  bearishTrend,
  bullishTrend,
  bullishTrendWithPullback,
  EURUSD,
  rangeSeries,
  snapshot,
} from "../fixtures/candles";

function context(
  bias: ReturnType<typeof bullishTrend>,
  setup: ReturnType<typeof bullishTrend>,
  trigger: ReturnType<typeof bullishTrend>
): AnalysisContext {
  return {
    instrument: { ...EURUSD },
    biasTimeframe: {
      timeframe: "H4",
      snapshot: snapshot(bias, "H4"),
    },
    setupTimeframe: {
      timeframe: "H1",
      snapshot: snapshot(setup, "H1"),
    },
    triggerTimeframe: {
      timeframe: "M15",
      snapshot: snapshot(trigger, "M15"),
    },
    accountBalance: 10_000,
    accountCurrency: "USD",
    execution: {
      now: trigger[trigger.length - 1].timestamp,
      mode: "PAPER",
      marketDataFreshness: "FRESH",
      marketDataAgeMs: 0,
      spreadPips: 0.8,
      newsPending: false,
    },
  };
}

describe("Phase 12.3 routed orchestrator parity", () => {
  it.each([
    {
      name: "bullish pullback",
      input: context(
        bullishTrend(140),
        bullishTrendWithPullback(120, 1.0, "H1"),
        bullishTrendWithPullback(60, 1.0, "M15")
      ),
    },
    {
      name: "bearish market",
      input: context(
        bearishTrend(140),
        bearishTrend(120),
        bearishTrend(60)
      ),
    },
    {
      name: "range market",
      input: context(
        rangeSeries(140, 1.1, 0.003, "H4"),
        rangeSeries(120, 1.1, 0.003, "H1"),
        rangeSeries(60, 1.1, 0.003, "M15")
      ),
    },
  ])("keeps the Phase 12.2 pipeline exact for $name", ({ input }) => {
    const routed = analyzeMarketWithRouting(input);
    const legacyNamedStrategy = analyzeTrendPullback(input);

    expect(routed.pipeline).toEqual(legacyNamedStrategy);
    expect(analyzeMarket(input)).toEqual(legacyNamedStrategy);
    expect(routed.routing.selectedStrategyId).toBe("TREND_PULLBACK");
    expect(routed.routing.regime).toBe(routed.pipeline.regime.data.regime);
  });

  it("is deterministic for both routing metadata and pipeline output", () => {
    const input = context(
      bullishTrend(140),
      bullishTrendWithPullback(120, 1.0, "H1"),
      bullishTrendWithPullback(60, 1.0, "M15")
    );

    expect(analyzeMarketWithRouting(input)).toEqual(
      analyzeMarketWithRouting(input)
    );
  });
});
