/**
 * Runtime market-data composition.
 *
 * One provider instance is shared by scanner + chart so provider health/source
 * stay coherent. Live-specific account conversion rates are primed from the
 * same provider before each live scan.
 */

import { DEFAULT_ACCOUNT, SYMBOL_METADATA } from "@/config/scanner";
import { DEMO_SCENARIOS } from "@/config/demo-scenarios";
import {
  TableAccountConversionResolver,
  type RateTable,
} from "@/market-data/account-conversion";
import { createRuntimeMarketDataProvider } from "@/providers/market-data/runtime-provider";
import { MockMarketDataProvider, MOCK_ANALYSIS_ANCHOR } from "@/providers/market-data/mock-provider";
import type { MarketDataProvider } from "@/providers/market-data/provider";

const provider = createRuntimeMarketDataProvider({
  mockConfig: { scenarios: DEMO_SCENARIOS },
});

const conversionResolver = new TableAccountConversionResolver(
  provider instanceof MockMarketDataProvider ? provider.getRates() : {}
);

export function runtimeMarketDataProvider(): MarketDataProvider {
  return provider;
}

export function runtimeProviderId(): string {
  return provider.id;
}

export function runtimeUsesLiveMarketData(): boolean {
  return provider.id !== "mock";
}

export function runtimeDefaultAsOf(): number {
  return provider instanceof MockMarketDataProvider
    ? MOCK_ANALYSIS_ANCHOR
    : Date.now();
}

export function runtimeConversionResolver(): TableAccountConversionResolver {
  return conversionResolver;
}

export async function buildConversionRateTable(
  marketData: MarketDataProvider,
  accountCurrency: string,
  asOf: number
): Promise<RateTable> {
  if (marketData instanceof MockMarketDataProvider) {
    return marketData.getRates();
  }

  const currencies = new Set<string>();
  for (const metadata of Object.values(SYMBOL_METADATA)) {
    if (metadata.quoteCurrency !== accountCurrency) {
      currencies.add(metadata.quoteCurrency);
    }
  }

  const rates: RateTable = {};
  for (const quoteCurrency of currencies) {
    const direct = quoteCurrency + accountCurrency;
    const inverse = accountCurrency + quoteCurrency;
    const pair = SYMBOL_METADATA[direct]
      ? direct
      : SYMBOL_METADATA[inverse]
        ? inverse
        : null;

    if (!pair) continue;

    const quote = await marketData.getLatestPrice(pair, asOf);
    if (!quote.ok) continue;

    if (Number.isFinite(quote.data.price) && quote.data.price > 0) {
      rates[pair] = quote.data.price;
    }
  }

  return rates;
}

/**
 * Refresh quote->account conversion inputs from the live provider.
 *
 * The Risk Engine stays synchronous and pure; the async market-data lookup is
 * completed before the scanner builds any market context.
 */
export async function primeRuntimeConversionRates(
  asOf: number,
  accountCurrency: string = DEFAULT_ACCOUNT.currency
): Promise<RateTable> {
  const rates = await buildConversionRateTable(provider, accountCurrency, asOf);
  conversionResolver.setRates(rates);
  return rates;
}
