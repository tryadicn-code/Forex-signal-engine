/**
 * Market-data provider abstraction (Section 3 / 24 spec).
 *
 * The application talks to this interface and never to a vendor SDK. A new
 * provider (Twelve Data, OANDA, Polygon, Finnhub, Alpha Vantage, a MetaTrader
 * bridge) is added by implementing this interface and normalizing into the
 * canonical types; nothing else in the codebase changes. Provider selection is
 * driven by configuration (`scanner.providerId`), not by imports.
 */

import type { Timeframe } from "@/types/market";
import type {
  CanonicalCandle,
  ProviderResult,
  ProviderStatus,
  Quote,
  SymbolMetadata,
} from "@/types/market-data";

/** Request for one symbol / timeframe candle window. */
export interface CandleRequest {
  symbol: string;
  timeframe: Timeframe;
  /** Number of candles wanted. */
  limit: number;
  /**
   * Replay/backtest anchor: only candles that had CLOSED at or before this UTC
   * epoch ms may be returned. This is the no-look-ahead boundary - a provider
   * must never surface a bar that closes after `asOf`.
   */
  asOf: number;
}

export interface MarketDataProvider {
  /** Stable provider id, e.g. "mock" or "twelvedata". */
  readonly id: string;

  /** Closed candles for one symbol/timeframe, normalized to canonical shape. */
  getCandles(request: CandleRequest): Promise<ProviderResult<CanonicalCandle[]>>;

  /** Latest price (and spread when available) for one symbol. */
  getLatestPrice(symbol: string, asOf?: number): Promise<ProviderResult<Quote>>;

  /** Current spread in pips for one symbol. */
  getSpread(symbol: string, asOf?: number): Promise<ProviderResult<number>>;

  /** Instrument metadata needed for risk sizing. */
  getSymbolMetadata(symbol: string): Promise<ProviderResult<SymbolMetadata>>;

  /** Operational health. Kept separate from trading analysis. */
  getProviderStatus(): ProviderStatus;
}

/**
 * Shared success/failure bookkeeping so every provider reports health the same
 * way. Implementations call {@link recordSuccess} / {@link recordFailure} around
 * their real network work; the status is operational data only.
 */
export abstract class BaseMarketDataProvider {
  protected status: ProviderStatus = {
    state: "CONNECTED",
    lastSuccessAt: null,
    lastFailureAt: null,
    errorCount: 0,
  };

  getProviderStatus(): ProviderStatus {
    return { ...this.status };
  }

  protected recordSuccess(latencyMs?: number): void {
    this.status.lastSuccessAt = Date.now();
    this.status.latencyMs = latencyMs;
    this.status.state = "CONNECTED";
  }

  protected recordFailure(): void {
    this.status.lastFailureAt = Date.now();
    this.status.errorCount += 1;
    this.status.state = "DEGRADED";
  }

  protected markDisconnected(): void {
    this.status.state = "DISCONNECTED";
    this.status.lastFailureAt = Date.now();
    this.status.errorCount += 1;
  }
}

export { type MarketDataProvider as Provider };