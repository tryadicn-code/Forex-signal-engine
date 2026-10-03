/**
 * MetaTrader 5 market-data provider.
 *
 * Talks only to the local read-only MT5 bridge. It never submits orders.
 */

import { SYMBOL_METADATA } from "@/config/scanner";
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

export interface Mt5ProviderConfig {
  bridgeUrl?: string;
  requestTimeoutMs?: number;
}

export type Mt5Fetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface Mt5BridgeCandle {
  timestamp?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

interface Mt5CandlesResponse {
  symbol?: string;
  resolvedSymbol?: string;
  timeframe?: string;
  candles?: Mt5BridgeCandle[];
  error?: string;
}

interface Mt5QuoteResponse {
  symbol?: string;
  resolvedSymbol?: string;
  bid?: number;
  ask?: number;
  price?: number;
  timestamp?: number;
  error?: string;
}

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8765";
const DEFAULT_TIMEOUT_MS = 5_000;

export class Mt5MarketDataProvider
  extends BaseMarketDataProvider
  implements MarketDataProvider
{
  readonly id = "mt5";

  private readonly bridgeUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: Mt5Fetch;

  constructor(
    config: Mt5ProviderConfig = {},
    fetchImpl: Mt5Fetch = fetch
  ) {
    super();
    this.bridgeUrl = (config.bridgeUrl ?? DEFAULT_BRIDGE_URL).replace(/\/$/, "");
    this.timeoutMs = config.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = fetchImpl;
  }

  async getCandles(
    request: CandleRequest
  ): Promise<ProviderResult<CanonicalCandle[]>> {
    if (!SYMBOL_METADATA[request.symbol]) {
      return this.failure(
        "SYMBOL_NOT_SUPPORTED",
        "Unsupported MT5 symbol " + request.symbol + "."
      );
    }

    const params = new URLSearchParams({
      symbol: request.symbol,
      timeframe: request.timeframe,
      limit: String(request.limit),
      asOf: String(request.asOf),
    });

    const response = await this.requestJson<Mt5CandlesResponse>(
      "/candles?" + params.toString()
    );
    if (!response.ok) return response;

    const candles = response.data.candles;
    if (!Array.isArray(candles)) {
      return this.failure(
        "MALFORMED_RESPONSE",
        "MT5 bridge response did not contain a candles array."
      );
    }

    const normalized: CanonicalCandle[] = [];
    for (const candle of candles) {
      if (!isValidBridgeCandle(candle)) {
        return this.failure(
          "MALFORMED_RESPONSE",
          "MT5 bridge returned a malformed candle for " + request.symbol + "."
        );
      }

      normalized.push({
        symbol: request.symbol,
        timeframe: request.timeframe,
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume ?? 0,
        source: this.id,
        closed: true,
      });
    }

    normalized.sort((a, b) => a.timestamp - b.timestamp);
    const limited = normalized.slice(
      Math.max(0, normalized.length - request.limit)
    );

    if (limited.length === 0) {
      return this.failure(
        "EMPTY_RESPONSE",
        "MT5 bridge returned no completed candles for " +
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
    if (!metadata) {
      return this.failure(
        "SYMBOL_NOT_SUPPORTED",
        "Unsupported MT5 symbol " + symbol + "."
      );
    }

    const params = new URLSearchParams({ symbol });
    if (typeof asOf === "number" && Number.isFinite(asOf)) {
      params.set("asOf", String(asOf));
    }

    const response = await this.requestJson<Mt5QuoteResponse>(
      "/quote?" + params.toString()
    );
    if (!response.ok) return response;

    const bid = finitePositive(response.data.bid);
    const ask = finitePositive(response.data.ask);
    const price = finitePositive(response.data.price);
    const timestamp = finitePositive(response.data.timestamp);

    if (
      bid === null ||
      ask === null ||
      price === null ||
      timestamp === null ||
      ask < bid
    ) {
      return this.failure(
        "MALFORMED_RESPONSE",
        "MT5 bridge returned an invalid quote for " + symbol + "."
      );
    }

    return {
      ok: true,
      data: {
        symbol,
        price,
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
        "MT5 spread was unavailable for " + symbol + "."
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

  private async requestJson<T>(
    path: string
  ): Promise<ProviderResult<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();

    try {
      const response = await this.fetchImpl(this.bridgeUrl + path, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
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
          "MT5 bridge returned a non-JSON response."
        );
      }

      this.recordSuccess(latencyMs);
      return { ok: true, data: body as T };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.markDisconnected();
      return {
        ok: false,
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: controller.signal.aborted
            ? "MT5 bridge request timed out."
            : "MT5 bridge is unavailable: " + message,
          at: Date.now(),
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private httpFailure(
    status: number,
    body: unknown
  ): ProviderResult<never> {
    const message = bridgeErrorMessage(body) ?? "MT5 bridge HTTP " + status + ".";
    if (status === 429) return this.failure("RATE_LIMIT", message);
    if (status === 400 || status === 404) {
      const code: ProviderErrorCode = /timeframe/i.test(message)
        ? "TIMEFRAME_NOT_SUPPORTED"
        : "SYMBOL_NOT_SUPPORTED";
      return this.failure(code, message);
    }
    if (status >= 500) {
      this.markDisconnected();
      return {
        ok: false,
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message,
          at: Date.now(),
        },
      };
    }
    return this.failure("MALFORMED_RESPONSE", message);
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

function isValidBridgeCandle(
  candle: Mt5BridgeCandle
): candle is Required<
  Pick<Mt5BridgeCandle, "timestamp" | "open" | "high" | "low" | "close">
> &
  Mt5BridgeCandle {
  const timestamp = finitePositive(candle.timestamp);
  const open = finitePositive(candle.open);
  const high = finitePositive(candle.high);
  const low = finitePositive(candle.low);
  const close = finitePositive(candle.close);

  return (
    timestamp !== null &&
    open !== null &&
    high !== null &&
    low !== null &&
    close !== null &&
    high >= Math.max(open, close, low) &&
    low <= Math.min(open, close, high)
  );
}

function finitePositive(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function bridgeErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { error?: unknown; message?: unknown };
  if (typeof record.error === "string") return record.error;
  if (typeof record.message === "string") return record.message;
  return null;
}
