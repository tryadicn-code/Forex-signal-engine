/**
 * OANDA v20 market-data provider.
 *
 * Market-data only. This provider never sends orders and is safe to use while
 * the application remains in SIGNAL_ONLY mode.
 */

import { SYMBOL_METADATA } from "@/config/scanner";
import { isCandleClosed } from "@/market-data/timeframe";
import type { Timeframe } from "@/types/market";
import type {
  CanonicalCandle,
  ProviderError,
  ProviderErrorCode,
  ProviderResult,
  Quote,
  SymbolMetadata,
} from "@/types/market-data";
import {
  BaseMarketDataProvider,
  type CandleRequest,
  type MarketDataProvider,
} from "./provider";

export type OandaEnvironment = "practice" | "live";

export interface OandaProviderConfig {
  token?: string;
  accountId?: string;
  environment?: OandaEnvironment;
  /** Override only for tests/self-hosted proxies. */
  baseUrl?: string;
  requestTimeoutMs?: number;
}

export type OandaFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface OandaPriceComponent {
  o: string;
  h: string;
  l: string;
  c: string;
}

interface OandaCandle {
  complete?: boolean;
  volume?: number;
  time?: string;
  mid?: OandaPriceComponent;
  bid?: OandaPriceComponent;
  ask?: OandaPriceComponent;
}

interface OandaCandlesResponse {
  instrument?: string;
  granularity?: string;
  candles?: OandaCandle[];
  errorCode?: string;
  errorMessage?: string;
}

interface OandaLiquidityPrice {
  price?: string;
  liquidity?: number;
}

interface OandaClientPrice {
  instrument?: string;
  time?: string;
  tradeable?: boolean;
  bids?: OandaLiquidityPrice[];
  asks?: OandaLiquidityPrice[];
  closeoutBid?: string;
  closeoutAsk?: string;
}

interface OandaPricingResponse {
  prices?: OandaClientPrice[];
  errorCode?: string;
  errorMessage?: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_CANDLE_COUNT = 5_000;

const GRANULARITY: Record<Timeframe, string> = {
  M1: "M1",
  M5: "M5",
  M15: "M15",
  M30: "M30",
  H1: "H1",
  H4: "H4",
  D1: "D",
  W1: "W",
  MN: "M",
};

export function toOandaInstrument(symbol: string): string | null {
  const metadata = SYMBOL_METADATA[symbol];
  return metadata
    ? metadata.baseCurrency + "_" + metadata.quoteCurrency
    : null;
}

export function toOandaGranularity(timeframe: Timeframe): string {
  return GRANULARITY[timeframe];
}

export function oandaBaseUrl(environment: OandaEnvironment): string {
  return environment === "live"
    ? "https://api-fxtrade.oanda.com"
    : "https://api-fxpractice.oanda.com";
}

export class OandaMarketDataProvider
  extends BaseMarketDataProvider
  implements MarketDataProvider
{
  readonly id = "oanda";

  private readonly token: string;
  private readonly accountId: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: OandaFetch;

  constructor(
    config: OandaProviderConfig = {},
    fetchImpl: OandaFetch = fetch
  ) {
    super();
    const environment = config.environment ?? "practice";
    this.token = (config.token ?? "").trim();
    this.accountId = (config.accountId ?? "").trim();
    this.baseUrl = (config.baseUrl ?? oandaBaseUrl(environment)).replace(/\/$/, "");
    this.timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = fetchImpl;

    if (!this.token || !this.accountId) {
      this.status.state = "DISCONNECTED";
    }
  }

  async getCandles(
    request: CandleRequest
  ): Promise<ProviderResult<CanonicalCandle[]>> {
    const instrument = toOandaInstrument(request.symbol);
    if (!instrument) {
      return this.failure(
        "SYMBOL_NOT_SUPPORTED",
        "Unsupported OANDA symbol " + request.symbol + "."
      );
    }

    if (!this.token) {
      return this.configurationFailure("OANDA_API_TOKEN is not configured.");
    }

    const count = Math.min(
      MAX_CANDLE_COUNT,
      Math.max(request.limit + 5, request.limit)
    );
    const params = new URLSearchParams({
      price: "M",
      granularity: toOandaGranularity(request.timeframe),
      count: String(count),
      to: new Date(request.asOf).toISOString(),
      smooth: "false",
    });

    const response = await this.requestJson<OandaCandlesResponse>(
      "/v3/instruments/" +
        encodeURIComponent(instrument) +
        "/candles?" +
        params.toString()
    );
    if (!response.ok) return response;

    const nativeCandles = response.data.candles;
    if (!Array.isArray(nativeCandles)) {
      return this.failure(
        "MALFORMED_RESPONSE",
        "OANDA candle response did not contain a candles array."
      );
    }

    const parsed: CanonicalCandle[] = [];
    for (const candle of nativeCandles) {
      if (!candle.complete) continue;
      const timestamp = parseOandaTime(candle.time);
      const mid = parseComponent(candle.mid);
      if (timestamp === null || mid === null) {
        return this.failure(
          "MALFORMED_RESPONSE",
          "OANDA returned a malformed completed candle for " +
            request.symbol +
            "."
        );
      }

      const closed = isCandleClosed(
        request.timeframe,
        timestamp,
        request.asOf
      );
      if (!closed) continue;

      parsed.push({
        symbol: request.symbol,
        timeframe: request.timeframe,
        timestamp,
        open: mid.open,
        high: mid.high,
        low: mid.low,
        close: mid.close,
        volume:
          typeof candle.volume === "number" && Number.isFinite(candle.volume)
            ? candle.volume
            : 0,
        source: this.id,
        closed: true,
      });
    }

    parsed.sort((a, b) => a.timestamp - b.timestamp);
    const limited = parsed.slice(Math.max(0, parsed.length - request.limit));
    if (limited.length === 0) {
      return this.failure(
        "EMPTY_RESPONSE",
        "OANDA returned no completed candles for " +
          request.symbol +
          " " +
          request.timeframe +
          "."
      );
    }

    return { ok: true, data: limited };
  }

  async getLatestPrice(
    symbol: string,
    asOf?: number
  ): Promise<ProviderResult<Quote>> {
    const metadata = SYMBOL_METADATA[symbol];
    const instrument = toOandaInstrument(symbol);
    if (!metadata || !instrument) {
      return this.failure(
        "SYMBOL_NOT_SUPPORTED",
        "Unsupported OANDA symbol " + symbol + "."
      );
    }

    if (!this.token) {
      return this.configurationFailure("OANDA_API_TOKEN is not configured.");
    }

    // Scanner calls always carry asOf. Use a completed bid/ask/mid candle so
    // the quote cannot leak market data that occurred after the analysis anchor.
    if (typeof asOf === "number" && Number.isFinite(asOf)) {
      return this.getAsOfQuote(symbol, metadata, instrument, asOf);
    }

    if (!this.accountId) {
      return this.configurationFailure("OANDA_ACCOUNT_ID is not configured.");
    }

    const params = new URLSearchParams({ instruments: instrument });
    const response = await this.requestJson<OandaPricingResponse>(
      "/v3/accounts/" +
        encodeURIComponent(this.accountId) +
        "/pricing?" +
        params.toString()
    );
    if (!response.ok) return response;

    const price = response.data.prices?.[0];
    if (!price) {
      return this.failure(
        "EMPTY_RESPONSE",
        "OANDA returned no current price for " + symbol + "."
      );
    }

    const bid = parseFinitePositive(
      price.bids?.[0]?.price ?? price.closeoutBid
    );
    const ask = parseFinitePositive(
      price.asks?.[0]?.price ?? price.closeoutAsk
    );
    const timestamp = parseOandaTime(price.time);
    if (bid === null || ask === null || timestamp === null || ask < bid) {
      return this.failure(
        "MALFORMED_RESPONSE",
        "OANDA returned an invalid bid/ask quote for " + symbol + "."
      );
    }

    return {
      ok: true,
      data: {
        symbol,
        price: (bid + ask) / 2,
        spreadPips: (ask - bid) / metadata.pipSize,
        timestamp,
      },
    };
  }

  async getSpread(
    symbol: string,
    asOf?: number
  ): Promise<ProviderResult<number>> {
    const quote = await this.getLatestPrice(symbol, asOf);
    if (!quote.ok) return quote;
    if (
      quote.data.spreadPips === undefined ||
      !Number.isFinite(quote.data.spreadPips)
    ) {
      return this.failure(
        "EMPTY_RESPONSE",
        "OANDA spread was unavailable for " + symbol + "."
      );
    }
    return { ok: true, data: quote.data.spreadPips };
  }

  async getSymbolMetadata(
    symbol: string
  ): Promise<ProviderResult<SymbolMetadata>> {
    const metadata = SYMBOL_METADATA[symbol];
    if (!metadata) {
      return this.failure(
        "SYMBOL_NOT_SUPPORTED",
        "No metadata configured for " + symbol + "."
      );
    }
    return { ok: true, data: metadata };
  }

  private async getAsOfQuote(
    symbol: string,
    metadata: SymbolMetadata,
    instrument: string,
    asOf: number
  ): Promise<ProviderResult<Quote>> {
    const params = new URLSearchParams({
      price: "MBA",
      granularity: "M1",
      count: "5",
      to: new Date(asOf).toISOString(),
      smooth: "false",
    });

    const response = await this.requestJson<OandaCandlesResponse>(
      "/v3/instruments/" +
        encodeURIComponent(instrument) +
        "/candles?" +
        params.toString()
    );
    if (!response.ok) return response;

    const candidates = (response.data.candles ?? [])
      .map((candle) => {
        const timestamp = parseOandaTime(candle.time);
        const mid = parseComponent(candle.mid);
        const bid = parseComponent(candle.bid);
        const ask = parseComponent(candle.ask);
        return { candle, timestamp, mid, bid, ask };
      })
      .filter(
        (item) =>
          item.candle.complete === true &&
          item.timestamp !== null &&
          isCandleClosed("M1", item.timestamp, asOf)
      );

    const latest = candidates.at(-1);
    if (
      !latest ||
      latest.timestamp === null ||
      latest.mid === null ||
      latest.bid === null ||
      latest.ask === null
    ) {
      return this.failure(
        "EMPTY_RESPONSE",
        "OANDA returned no completed as-of quote for " + symbol + "."
      );
    }

    const spread = latest.ask.close - latest.bid.close;
    if (!Number.isFinite(spread) || spread < 0) {
      return this.failure(
        "MALFORMED_RESPONSE",
        "OANDA returned an invalid historical spread for " + symbol + "."
      );
    }

    return {
      ok: true,
      data: {
        symbol,
        price: latest.mid.close,
        spreadPips: spread / metadata.pipSize,
        timestamp: latest.timestamp,
      },
    };
  }

  private async requestJson<T>(
    path: string
  ): Promise<ProviderResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();

    try {
      const response = await this.fetchImpl(this.baseUrl + path, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + this.token,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      const latencyMs = Math.max(0, Date.now() - started);
      const body = await parseJsonSafely(response);
      if (!response.ok) {
        return this.httpFailure(response.status, body);
      }

      if (body === null || typeof body !== "object") {
        return this.failure(
          "MALFORMED_RESPONSE",
          "OANDA returned a non-JSON response."
        );
      }

      this.recordSuccess(latencyMs);
      return { ok: true, data: body as T };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return this.failure(
        "PROVIDER_UNAVAILABLE",
        controller.signal.aborted
          ? "OANDA request timed out."
          : "OANDA request failed: " + message
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private httpFailure(
    status: number,
    body: unknown
  ): ProviderResult<never> {
    const message = oandaErrorMessage(body) ?? "OANDA HTTP " + status + ".";
    if (status === 429) return this.failure("RATE_LIMIT", message);
    if (status === 401 || status === 403) {
      return this.configurationFailure(message);
    }
    if (status === 404) {
      return this.failure("SYMBOL_NOT_SUPPORTED", message);
    }
    if (status >= 500) {
      return this.failure("PROVIDER_UNAVAILABLE", message);
    }
    return this.failure("MALFORMED_RESPONSE", message);
  }

  private configurationFailure(message: string): ProviderResult<never> {
    this.markDisconnected();
    return {
      ok: false,
      error: {
        code: "CONFIG_ERROR",
        message,
        at: Date.now(),
      },
    };
  }

  private failure(
    code: ProviderErrorCode,
    message: string
  ): ProviderResult<never> {
    this.recordFailure();
    const error: ProviderError = {
      code,
      message,
      at: Date.now(),
    };
    return { ok: false, error };
  }
}

function parseComponent(
  component: OandaPriceComponent | undefined
): { open: number; high: number; low: number; close: number } | null {
  if (!component) return null;
  const open = parseFinitePositive(component.o);
  const high = parseFinitePositive(component.h);
  const low = parseFinitePositive(component.l);
  const close = parseFinitePositive(component.c);

  if (
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    high < Math.max(open, close, low) ||
    low > Math.min(open, close, high)
  ) {
    return null;
  }

  return { open, high, low, close };
}

function parseFinitePositive(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseOandaTime(value: string | undefined): number | null {
  if (!value) return null;
  // JS engines are not required to parse OANDA's nanosecond precision.
  const normalized = value.replace(/\.(\d{3})\d+Z$/, ".$1Z");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function oandaErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { errorMessage?: unknown; errorCode?: unknown };
  if (typeof record.errorMessage === "string") return record.errorMessage;
  if (typeof record.errorCode === "string") return record.errorCode;
  return null;
}
