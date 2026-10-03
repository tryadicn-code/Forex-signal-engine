/**
 * Read-only candle access for the price chart.
 *
 * Scanner and chart share the same runtime MarketDataProvider instance, so
 * switching MARKET_DATA_PROVIDER changes both surfaces consistently.
 */

import { SYMBOL_METADATA } from "@/config/scanner";
import { runtimeMarketDataProvider } from "@/server/runtime-market-data";
import type { CandleRequest } from "@/providers/market-data/provider";
import type { ProviderResult } from "@/types/market-data";
import type { PriceChartResponse } from "@/types/chart";

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

  const provider = runtimeMarketDataProvider();
  const result = await provider.getCandles(request);
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
      source: provider.id,
      asOf: request.asOf,
      pricePrecision: metadata.pricePrecision,
      candles,
    },
  };
}
