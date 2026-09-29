/**
 * Runtime market-data provider selection.
 *
 * The scanner remains provider-agnostic. Deployments choose the provider with
 * MARKET_DATA_PROVIDER, while tests/default development stay on mock unless
 * explicitly switched to OANDA.
 */

import { SYMBOL_METADATA } from "@/config/scanner";
import type { MockProviderConfig } from "./mock-provider";
import { MockMarketDataProvider } from "./mock-provider";
import {
  OandaMarketDataProvider,
  type OandaEnvironment,
} from "./oanda-provider";
import type { MarketDataProvider } from "./provider";

export type RuntimeMarketDataProviderId = "mock" | "oanda";

export interface RuntimeProviderOptions {
  env?: Record<string, string | undefined>;
  mockConfig?: MockProviderConfig;
}

export function resolveRuntimeProviderId(
  env: Record<string, string | undefined> = process.env
): RuntimeMarketDataProviderId {
  const configured = (env.MARKET_DATA_PROVIDER ?? "mock")
    .trim()
    .toLowerCase();

  return configured === "oanda" ? "oanda" : "mock";
}

export function resolveRuntimeSymbols(
  env: Record<string, string | undefined> = process.env
): string[] | undefined {
  const raw = env.SCANNER_SYMBOLS?.trim();
  if (!raw) return undefined;

  const symbols = raw
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => Boolean(SYMBOL_METADATA[symbol]));

  return symbols.length > 0 ? [...new Set(symbols)] : undefined;
}

export function createRuntimeMarketDataProvider(
  options: RuntimeProviderOptions = {}
): MarketDataProvider {
  const env = options.env ?? process.env;
  const providerId = resolveRuntimeProviderId(env);

  if (providerId === "oanda") {
    const environment: OandaEnvironment =
      (env.OANDA_ENVIRONMENT ?? "practice").trim().toLowerCase() === "live"
        ? "live"
        : "practice";

    return new OandaMarketDataProvider({
      token: env.OANDA_API_TOKEN,
      accountId: env.OANDA_ACCOUNT_ID,
      environment,
      baseUrl: env.OANDA_BASE_URL,
      requestTimeoutMs: parsePositiveInt(env.OANDA_REQUEST_TIMEOUT_MS),
    });
  }

  return new MockMarketDataProvider(options.mockConfig);
}

export function isLiveMarketDataProvider(
  provider: MarketDataProvider
): boolean {
  return provider.id !== "mock";
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
