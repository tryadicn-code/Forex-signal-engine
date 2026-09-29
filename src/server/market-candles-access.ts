/**
 * Read-only candle access for the Phase 3 price chart.
 *
 * This layer intentionally exposes only canonical closed candles. It does not
 * invoke the signal engine, derive indicators, or mutate scanner state.
 */

import "server-only";

import { DEMO_SCENARIOS } from "@/config/demo-scenarios";
import { SYMBOL_METADATA } from "@/config/scanner";
import { MockMarketDataProvider } from "@/providers/market-data/mock-provider";
import type { CandleRequest } from "@/providers/market-data/provider";
import type { ProviderResult } from "@/types/market-data";
import type { PriceChartResponse } from "@/types/chart";

let chartProvider: MockMarketDataProvider | null = null;

function provider(): MockMarketDataProvider {
  if (!chartProvider) {
    chartProvider = new MockMarketDataProvider({ scenarios: DEMO_SCENARIOS });
  }
  return chartProvider;
}

export async function readPriceCandles(
  request: CandleRequest
): Promise<ProviderResult<PriceChartResponse>> {
  const metadata = SYMBOL_METADATA[request.symbol];
  if (!metadata) {
    return {
      ok: false,
      error: {
        code: "SYMBOL_NOT_SUPPORTED",
        message: "No metadata for " + request.symbol + ".",
        at: Date.now(),
      },
    };
  }

  const result = await provider().getCandles(request);
  if (!result.ok) return result;

  const candles = result.data
    .filter((candle) => candle.closed)
    .map((candle) => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

  return {
    ok: true,
    data: {
      symbol: request.symbol,
      timeframe: request.timeframe,
      source: provider().id,
      asOf: request.asOf,
      pricePrecision: metadata.pricePrecision,
      candles,
    },
  };
}
