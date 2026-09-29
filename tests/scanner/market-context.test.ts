import { describe, it, expect } from "vitest";
import {
  buildMarketContext,
  DEFAULT_MIN_BARS_PER_TIMEFRAME,
} from "@/scanner/market-context";
import type { BuildMarketContextInput } from "@/scanner/market-context";
import { MockMarketDataProvider } from "@/providers/market-data/mock-provider";
import type { MockSymbolScenario } from "@/providers/market-data/mock-provider";
import { TableAccountConversionResolver } from "@/market-data/account-conversion";
import { DEFAULT_FRESHNESS_THRESHOLDS, DEFAULT_TIMEFRAME_ROLES } from "@/config/scanner";
import { intervalMs } from "@/market-data/timeframe";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function mkInput(scenarios: Record<string, MockSymbolScenario> = {}): BuildMarketContextInput {
  const provider = new MockMarketDataProvider({ scenarios });
  return {
    symbol: "EURUSD",
    provider,
    roles: { ...DEFAULT_TIMEFRAME_ROLES },
    thresholds: { ...DEFAULT_FRESHNESS_THRESHOLDS },
    candleLookback: 220,
    accountCurrency: "USD",
    conversionResolver: new TableAccountConversionResolver(provider.getRates()),
    asOf: T0,
    minBarsPerTimeframe: DEFAULT_MIN_BARS_PER_TIMEFRAME,
  };
}

describe("buildMarketContext required-timeframe gate", () => {
  it("builds a full context when every required timeframe is healthy", async () => {
    const outcome = await buildMarketContext(mkInput());
    expect(outcome.context).not.toBeNull();
    expect(outcome.rejection).toBeNull();
    expect(outcome.context!.d1.candles.length).toBeGreaterThanOrEqual(DEFAULT_MIN_BARS_PER_TIMEFRAME);
    expect(outcome.context!.h4.candles.length).toBeGreaterThanOrEqual(DEFAULT_MIN_BARS_PER_TIMEFRAME);
    expect(outcome.context!.h1.candles.length).toBeGreaterThanOrEqual(DEFAULT_MIN_BARS_PER_TIMEFRAME);
    expect(outcome.context!.m15.candles.length).toBeGreaterThanOrEqual(DEFAULT_MIN_BARS_PER_TIMEFRAME);
  });

  it("rejects when the provider fails for the symbol entirely", async () => {
    const outcome = await buildMarketContext(
      mkInput({ EURUSD: { direction: "UP", fail: true } })
    );
    expect(outcome.context).toBeNull();
    expect(outcome.rejection).not.toBeNull();
    expect(outcome.providerError).not.toBeNull();
  });

  it("rejects when a required timeframe has too few bars", async () => {
    const provider = new FewBarsProvider();
    const outcome = await buildMarketContext({
      ...mkInput(),
      provider,
    });
    expect(outcome.context).toBeNull();
    expect(outcome.rejection?.reason).toBe("INSUFFICIENT_BARS");
  });

  it("drops and reports a single malformed candle, keeping the series usable", async () => {
    const outcome = await buildMarketContext(
      mkInput({ EURUSD: { direction: "UP", malformed: true } })
    );
    // One bad candle is dropped, but the series still has enough valid bars to
    // build a context; the issue is surfaced rather than silently hidden.
    expect(outcome.context).not.toBeNull();
    const malformed = outcome.perTimeframe
      .flatMap((o) => o.validation?.issues ?? [])
      .filter((i) => i.code === "MALFORMED_OHLC");
    expect(malformed.length).toBeGreaterThan(0);
  });

  it("rejects when a whole required timeframe is malformed", async () => {
    const provider = new AllMalformedProvider();
    const outcome = await buildMarketContext({ ...mkInput(), provider });
    expect(outcome.context).toBeNull();
    expect(outcome.rejection?.reason).toBe("INVALID_TIMEFRAME_DATA");
  });

  it("rejects when the roles are not four distinct timeframes", async () => {
    const outcome = await buildMarketContext({
      ...mkInput(),
      roles: { macro: "H1", bias: "H1", setup: "H1", trigger: "M15" },
    });
    expect(outcome.context).toBeNull();
    expect(outcome.rejection?.reason).toBe("MALFORMED_ROLES");
  });

  it("reports the specific timeframes that failed, not just a generic error", async () => {
    const outcome = await buildMarketContext(
      mkInput({ EURUSD: { direction: "UP", fail: true } })
    );
    expect(outcome.rejection?.timeframes.length).toBeGreaterThan(0);
    expect(outcome.rejection?.timeframes).toContain("D1");
  });

  it("uses trigger candle close time for aggregate freshness age", async () => {
    const outcome = await buildMarketContext(mkInput());
    const ctx = outcome.context!;
    expect(ctx.freshness.ageMs).toBe(ctx.m15.freshness.ageMs);
    expect(ctx.freshness.marketTimestamp).toBe(
      ctx.m15.freshness.marketTimestamp
    );
    expect(ctx.freshness.ageMs).not.toBe(
      Math.max(0, T0 - ctx.m15.asOf)
    );
  });

  it("keeps timeframe isolation: each timeframe has its own asOf and candles", async () => {
    const outcome = await buildMarketContext(mkInput());
    const ctx = outcome.context!;
    expect(ctx.d1.candles).not.toBe(ctx.h4.candles);
    expect(ctx.h1.candles).not.toBe(ctx.m15.candles);
    expect(ctx.d1.timeframe).toBe("D1");
    expect(ctx.h4.timeframe).toBe("H4");
    expect(ctx.h1.timeframe).toBe("H1");
    expect(ctx.m15.timeframe).toBe("M15");
  });

  it("resolves the quote->account conversion for a cross-currency pair", async () => {
    const provider = new MockMarketDataProvider({
      scenarios: { USDJPY: { direction: "UP" } },
    });
    const outcome = await buildMarketContext({
      ...mkInput(),
      symbol: "USDJPY",
      provider,
      conversionResolver: new TableAccountConversionResolver(provider.getRates()),
    });
    expect(outcome.context).not.toBeNull();
    expect(outcome.context!.quoteToAccountConversionRate).toBeGreaterThan(0);
    expect(outcome.conversion?.notRequired).toBe(false);
  });

  it("marks conversion as not required when quote equals account currency", async () => {
    const outcome = await buildMarketContext(mkInput());
    expect(outcome.context!.quoteToAccountConversionRate).toBeUndefined();
    expect(outcome.conversion?.notRequired).toBe(true);
  });
});

/**
 * Provider that returns a usable series for D1/H4/H1 but a near-empty series for
 * M15, to exercise the insufficient-bars branch on exactly one timeframe.
 */
/**
 * Provider whose M15 series is entirely malformed, so validation drops every
 * candle and the timeframe has too few usable bars to count as valid.
 */
class AllMalformedProvider extends MockMarketDataProvider {
  async getCandles(request: import("@/providers/market-data/provider").CandleRequest) {
    if (request.timeframe === "M15") {
      const base = await super.getCandles(request);
      if (!base.ok) return base;
      return {
        ok: true as const,
        data: base.data.map((c) => ({ ...c, high: c.low - 1 })),
      };
    }
    return super.getCandles(request);
  }
}

class FewBarsProvider extends MockMarketDataProvider {
  async getCandles(request: import("@/providers/market-data/provider").CandleRequest) {
    if (request.timeframe === "M15") {
      return {
        ok: true as const,
        data: [
          {
            symbol: request.symbol,
            timeframe: request.timeframe,
            timestamp: request.asOf - intervalMs(request.timeframe),
            open: 1.08,
            high: 1.081,
            low: 1.079,
            close: 1.0805,
            volume: 1000,
            source: "mock",
            closed: true,
          },
        ],
      };
    }
    return super.getCandles(request);
  }
}
