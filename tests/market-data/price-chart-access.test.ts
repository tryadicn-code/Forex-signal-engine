import { describe, expect, it } from "vitest";
import { readPriceCandles } from "@/server/market-candles-access";
import { MOCK_ANALYSIS_ANCHOR } from "@/providers/market-data/mock-provider";

describe("Phase 3 price chart candle access", () => {
  it("returns canonical closed candles for a supported pair and timeframe", async () => {
    const result = await readPriceCandles({
      symbol: "EURUSD",
      timeframe: "H1",
      limit: 120,
      asOf: MOCK_ANALYSIS_ANCHOR,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.symbol).toBe("EURUSD");
    expect(result.data.timeframe).toBe("H1");
    expect(result.data.source).toBe("mock");
    expect(result.data.candles).toHaveLength(120);
    expect(
      result.data.candles.every((candle) => candle.timestamp < MOCK_ANALYSIS_ANCHOR)
    ).toBe(true);
  });

  it("fails closed for an unsupported symbol", async () => {
    const result = await readPriceCandles({
      symbol: "NOTAPAIR",
      timeframe: "H1",
      limit: 120,
      asOf: MOCK_ANALYSIS_ANCHOR,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SYMBOL_NOT_SUPPORTED");
  });
});
