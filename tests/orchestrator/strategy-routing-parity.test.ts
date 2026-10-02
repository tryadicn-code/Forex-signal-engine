import { describe, expect, it } from "vitest";
import type { AnalysisContext } from "@/core/orchestrator";
import {
  analyzeMarket,
  analyzeMarketWithRouting,
} from "@/core/orchestrator";
import {
  analyzeBreakoutRetest,
  analyzeRangeMeanReversion,
  analyzeTrendPullback,
} from "@/core/strategies";
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
    configOverrides: {
      regime: {
        breakoutBandWidthRatio: 999,
      },
    },
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
  ])("keeps the Phase 12.2 pipeline exact for $name", ({ input }) => {
    const routed = analyzeMarketWithRouting(input);
    const legacyNamedStrategy = analyzeTrendPullback(input);

    expect(routed.pipeline).toEqual(legacyNamedStrategy);
    expect(analyzeMarket(input)).toEqual(legacyNamedStrategy);
    expect(routed.routing.selectedStrategyId).toBe("TREND_PULLBACK");
    expect(routed.routing.regime).toBe(routed.pipeline.regime.data.regime);
  });

  it("activates RANGE_MEAN_REVERSION when the audited router sees RANGE regime", () => {
    const input = context(
      rangeSeries(140, 1.105, 0.01, "H4"),
      rangeSeries(120, 1.105, 0.01, "H1"),
      rangeSeries(80, 1.105, 0.01, "M15")
    );
    input.configOverrides = {
      regime: {
        adxTrendThreshold: 999,
        adxStrongTrend: 999,
        highVolatilityAtrPct: 999,
        lowVolatilityAtrPct: -1,
        breakoutBandWidthRatio: 999,
      },
    };

    const routed = analyzeMarketWithRouting(input);
    const direct = analyzeRangeMeanReversion(input);

    expect(routed.routing.regime).toBe("RANGE");
    expect(routed.routing.preferredStrategyId).toBe("RANGE_MEAN_REVERSION");
    expect(routed.routing.selectedStrategyId).toBe("RANGE_MEAN_REVERSION");
    expect(routed.routing.mode).toBe("REGIME_MATCH");
    expect(routed.pipeline).toEqual(direct);
    expect(routed.pipeline.setup.data.setupType).toBe("range-mean-reversion");
  });

  it("activates BREAKOUT_RETEST when the audited router sees BREAKOUT regime", () => {
    const input = context(
      bullishTrend(160),
      bullishTrendWithPullback(140, 1.0, "H1"),
      bullishTrendWithPullback(80, 1.0, "M15")
    );
    input.configOverrides = {
      regime: {
        adxTrendThreshold: 0,
        breakoutBandWidthRatio: 0,
      },
    };

    const routed = analyzeMarketWithRouting(input);
    const direct = analyzeBreakoutRetest(input);

    expect(routed.routing.regime).toBe("BREAKOUT");
    expect(routed.routing.preferredStrategyId).toBe("BREAKOUT_RETEST");
    expect(routed.routing.selectedStrategyId).toBe("BREAKOUT_RETEST");
    expect(routed.routing.mode).toBe("REGIME_MATCH");
    expect(routed.pipeline).toEqual(direct);
    expect(routed.pipeline.setup.data.setupType).toBe("breakout-retest");
  });

  it("enforces LOW_VOLATILITY WAIT as a fail-closed no-strategy pipeline", () => {
    const input = context(
      rangeSeries(140, 1.105, 0.001, "H4"),
      rangeSeries(120, 1.105, 0.001, "H1"),
      rangeSeries(80, 1.105, 0.001, "M15")
    );
    input.configOverrides = {
      regime: {
        adxTrendThreshold: 999,
        adxStrongTrend: 999,
        highVolatilityAtrPct: 999,
        lowVolatilityAtrPct: 999,
        breakoutBandWidthRatio: 999,
      },
    };

    const routed = analyzeMarketWithRouting(input);

    expect(routed.routing.regime).toBe("LOW_VOLATILITY");
    expect(routed.routing.preferredStrategyId).toBeNull();
    expect(routed.routing.selectedStrategyId).toBeNull();
    expect(routed.routing.mode).toBe("NO_STRATEGY");
    expect(routed.pipeline.bias.data.direction).toBe("NEUTRAL");
    expect(routed.pipeline.setup.data.state).toBe("NONE");
    expect(routed.pipeline.setup.data.setupType).toBe("router-wait");
    expect(routed.pipeline.trigger).toBeNull();
    expect(routed.pipeline.risk).toBeNull();
    expect(routed.pipeline.execution).toBeNull();
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
