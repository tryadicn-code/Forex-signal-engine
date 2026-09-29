import { describe, expect, it } from "vitest";
import { buildConversionRateTable } from "@/server/runtime-market-data";
import type { MarketDataProvider } from "@/providers/market-data/provider";
import type {
  CanonicalCandle,
  ProviderResult,
  ProviderStatus,
  Quote,
  SymbolMetadata,
} from "@/types/market-data";
import { SYMBOL_METADATA } from "@/config/scanner";

const AS_OF = Date.UTC(2026, 8, 29, 12, 0, 0);

class QuoteOnlyProvider implements MarketDataProvider {
  readonly id = "quote-test";

  constructor(private readonly prices: Record<string, number>) {}

  async getCandles(): Promise<ProviderResult<CanonicalCandle[]>> {
    return {
      ok: false,
      error: {
        code: "PROVIDER_UNAVAILABLE",
        message: "not used",
        at: AS_OF,
      },
    };
  }

  async getLatestPrice(
    symbol: string
  ): Promise<ProviderResult<Quote>> {
    const price = this.prices[symbol];
    if (!price) {
      return {
        ok: false,
        error: {
          code: "EMPTY_RESPONSE",
          message: "missing quote",
          at: AS_OF,
        },
      };
    }
    return {
      ok: true,
      data: { symbol, price, timestamp: AS_OF },
    };
  }

  async getSpread(): Promise<ProviderResult<number>> {
    return { ok: true, data: 1 };
  }

  async getSymbolMetadata(
    symbol: string
  ): Promise<ProviderResult<SymbolMetadata>> {
    const metadata = SYMBOL_METADATA[symbol];
    return metadata
      ? { ok: true, data: metadata }
      : {
          ok: false,
          error: {
            code: "SYMBOL_NOT_SUPPORTED",
            message: "unsupported",
            at: AS_OF,
          },
        };
  }

  getProviderStatus(): ProviderStatus {
    return {
      state: "CONNECTED",
      lastSuccessAt: AS_OF,
      lastFailureAt: null,
      errorCount: 0,
    };
  }
}

describe("live account conversion priming", () => {
  it("builds only real market rates needed by the USD account universe", async () => {
    const provider = new QuoteOnlyProvider({
      USDJPY: 149.5,
      USDCHF: 0.895,
      USDCAD: 1.365,
      GBPUSD: 1.265,
      AUDUSD: 0.655,
    });

    const rates = await buildConversionRateTable(provider, "USD", AS_OF);

    expect(rates).toEqual({
      USDJPY: 149.5,
      USDCHF: 0.895,
      USDCAD: 1.365,
      GBPUSD: 1.265,
      AUDUSD: 0.655,
    });
  });

  it("leaves an unavailable conversion absent rather than inventing a rate", async () => {
    const provider = new QuoteOnlyProvider({
      USDJPY: 149.5,
    });

    const rates = await buildConversionRateTable(provider, "USD", AS_OF);

    expect(rates.USDJPY).toBe(149.5);
    expect(rates.GBPUSD).toBeUndefined();
    expect(rates.AUDUSD).toBeUndefined();
  });
});
