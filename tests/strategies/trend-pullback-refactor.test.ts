import { describe, expect, it } from "vitest";
import type { AnalysisContext } from "@/core/orchestrator";
import { analyzeMarket } from "@/core/orchestrator";
import {
  analyzeTrendPullback,
  TREND_PULLBACK_STRATEGY,
  TREND_PULLBACK_STRATEGY_ID,
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
  trigger: ReturnType<typeof bullishTrend>,
  overrides: Partial<AnalysisContext> = {}
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
    ...overrides,
  };
}

describe("Phase 12.2 TREND_PULLBACK refactor parity", () => {
  it("gives the existing strategy a stable identity", () => {
    expect(TREND_PULLBACK_STRATEGY_ID).toBe("TREND_PULLBACK");
    expect(TREND_PULLBACK_STRATEGY.id).toBe("TREND_PULLBACK");
    expect(TREND_PULLBACK_STRATEGY.analyze).toBe(analyzeTrendPullback);
  });

  it.each([
    {
      name: "bullish trend with pullback/resumption",
      input: context(
        bullishTrend(140),
        bullishTrendWithPullback(120, 1.0, "H1"),
        bullishTrendWithPullback(60, 1.0, "M15")
      ),
    },
    {
      name: "bearish directional market",
      input: context(
        bearishTrend(140),
        bearishTrend(120),
        bearishTrend(60)
      ),
    },
    {
      name: "explicit targets and config overrides",
      input: context(
        bullishTrend(140),
        bullishTrendWithPullback(120, 1.0, "H1"),
        bullishTrendWithPullback(60, 1.0, "M15"),
        {
          targetLevels: [1.2, 1.25],
          riskPercent: 0.5,
          configOverrides: {
            trigger: { minTriggerScore: 90 },
            risk: { minRR: 1.8 },
          },
        }
      ),
    },
  ])("preserves exact TREND_PULLBACK pipeline output for $name", ({ input }) => {
    const compatibility = analyzeMarket(input);
    const namedStrategy = analyzeTrendPullback(input);

    expect(compatibility).toEqual(namedStrategy);
  });

  it("does not claim range routing is TREND_PULLBACK compatibility", () => {
    const input = context(
      rangeSeries(140, 1.1, 0.003, "H4"),
      rangeSeries(120, 1.1, 0.003, "H1"),
      rangeSeries(60, 1.1, 0.003, "M15")
    );
    const compatibility = analyzeMarket(input);
    expect(compatibility.setup.data.setupType).not.toBe("trend-pullback");
    expect(compatibility.setup.data.setupType).toBe("router-wait");
  });

  it("preserves the pre-refactor public PipelineResult shape", () => {
    const result = analyzeMarket(
      context(
        bullishTrend(140),
        bullishTrendWithPullback(120, 1.0, "H1"),
        bullishTrendWithPullback(60, 1.0, "M15")
      )
    );

    expect(Object.keys(result).sort()).toEqual(
      [
        "structure",
        "regime",
        "bias",
        "setup",
        "setupStructure",
        "trigger",
        "risk",
        "execution",
      ].sort()
    );
  });

  it("remains deterministic across repeated runs of the named strategy", () => {
    const input = context(
      bullishTrend(140),
      bullishTrendWithPullback(120, 1.0, "H1"),
      bullishTrendWithPullback(60, 1.0, "M15")
    );

    expect(analyzeTrendPullback(input)).toEqual(analyzeTrendPullback(input));
  });
});
