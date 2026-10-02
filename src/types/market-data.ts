/**
 * Canonical market-data domain types (Phase 2).
 *
 * Phase 1 defined the trading-engine domain (@/types/market). Phase 2 adds the
 * market-data layer: whatever a vendor feed looks like, it is normalized into
 * the shapes in this file before ANY Phase 1 engine sees it. Nothing in
 * `src/core` may import this file - the dependency runs one way only:
 *
 *   vendor feed -> provider -> canonical types -> Phase 1 engines
 */

import type { Timeframe, ExecutionMode } from "@/types/market";

// ---------------------------------------------------------------------------
// Canonical candle
// ---------------------------------------------------------------------------

/**
 * The single internal candle representation.
 *
 * Every provider converts its native bars into this shape in
 * {@link import("@/market-data/normalize").normalizeCandles}. Timestamps are UTC
 * epoch milliseconds of the candle OPEN time; the candle is only {@link closed}
 * once its whole interval has elapsed (see {@link import("@/market-data/timeframe").candleCloseTime}).
 */
export interface CanonicalCandle {
  symbol: string;
  timeframe: Timeframe;
  /** UTC epoch ms of the candle OPEN. */
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Provider that produced this candle, e.g. "mock". */
  source: string;
  /** True once the candle's interval has fully elapsed at the observed time. */
  closed: boolean;
}

// ---------------------------------------------------------------------------
// Symbol metadata
// ---------------------------------------------------------------------------

/**
 * Instrument metadata as the data layer owns it.
 *
 * This is deliberately NOT the Phase 1 {@link import("@/types/market").CurrencyPair}:
 * it uses provider-facing field names and makes the lot metadata non-optional,
 * because the Risk Engine needs real values (JPY pairs must not fall back to a
 * 0.0001 pip size). {@link toCurrencyPair} converts it into the engine input.
 */
export interface SymbolMetadata {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  /** Smallest price increment, e.g. 0.0001 for EURUSD, 0.01 for USDJPY. */
  pipSize: number;
  /** Decimal places of price precision, e.g. 5 for EURUSD, 3 for USDJPY. */
  pricePrecision: number;
  /** Notional per 1.0 lot, e.g. 100_000 for a standard FX lot. */
  contractSize: number;
  minLot: number;
  maxLot: number;
  /** Lot increment the broker accepts, e.g. 0.01 or 0.1. */
  lotStep: number;
}

// ---------------------------------------------------------------------------
// Provider results
// ---------------------------------------------------------------------------

/** Machine-readable reason a provider call failed. */
export type ProviderErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "SYMBOL_NOT_SUPPORTED"
  | "TIMEFRAME_NOT_SUPPORTED"
  | "RATE_LIMIT"
  | "MALFORMED_RESPONSE"
  | "EMPTY_RESPONSE"
  | "CONFIG_ERROR";

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  /** UTC epoch ms of the failure, for health tracking. */
  at: number;
}

/**
 * Discriminated result so callers must handle failure explicitly - a provider
 * never throws past the boundary, it returns `{ ok: false }`.
 */
export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ProviderError };

/** A live quote for one symbol. */
export interface Quote {
  symbol: string;
  price: number;
  spreadPips?: number;
  /** UTC epoch ms the quote was produced. */
  timestamp: number;
}

export type ProviderConnectionState = "CONNECTED" | "DEGRADED" | "DISCONNECTED";

/**
 * Operational health of a provider, kept strictly separate from trading
 * analysis. Degraded means the provider answered but with warnings (slow,
 * partial, or stale); DISCONNECTED means it could not answer at all.
 */
export interface ProviderStatus {
  state: ProviderConnectionState;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  errorCount: number;
  /** Round-trip of the last call, when measured. */
  latencyMs?: number;
}

// ---------------------------------------------------------------------------
// Market-data validation
// ---------------------------------------------------------------------------

export type ValidationIssueCode =
  | "DUPLICATE_TIMESTAMP"
  | "OUT_OF_ORDER"
  | "INVALID_TIMESTAMP"
  | "MISSING_INTERVAL"
  | "MALFORMED_OHLC"
  | "NON_FINITE"
  | "NEGATIVE_PRICE"
  | "ZERO_PRICE"
  | "STALE_DATA";

export interface ValidationIssue {
  code: ValidationIssueCode;
  symbol: string;
  timeframe: Timeframe;
  /** Index into the input series the issue was found at, when applicable. */
  index?: number;
  /** UTC epoch ms of the offending candle, when applicable. */
  timestamp?: number;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  candles: CanonicalCandle[];
  issues: ValidationIssue[];
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

export type FreshnessStatus = "FRESH" | "DELAYED" | "STALE";

/**
 * Data-freshness classification for one observable data point.
 *
 * Age is measured from the market time the data describes (`marketTimestamp`)
 * to when the scanner received it (`receivedAt`), so a replayed backtest stays
 * truthful rather than comparing historical bars against the wall clock.
 */
export interface Freshness {
  source: string;
  /**
   * UTC epoch ms of the market time the newest closed candle describes, or null
   * when there is no closed candle at all. Null is the explicit missing-data
   * representation: the layer never fabricates a market timestamp, so absence
   * stays observable instead of collapsing into a fake age of zero.
   */
  marketTimestamp: number | null;
  receivedAt: number;
  /**
   * Age of the newest closed candle, in ms. Positive infinity when there is no
   * closed candle: no data is treated as infinitely old, which is STALE.
   */
  ageMs: number;
  status: FreshnessStatus;
  /** True when the timeframe had no closed candle to classify. */
  missing: boolean;
}

// ---------------------------------------------------------------------------
// Multi-timeframe market context
// ---------------------------------------------------------------------------

/** Closed, validated candles for exactly one timeframe, plus their freshness. */
export interface TimeframeContext {
  timeframe: Timeframe;
  candles: CanonicalCandle[];
  /** UTC epoch ms of the most recent CLOSED candle. */
  asOf: number;
  freshness: Freshness;
}

/**
 * The canonical multi-timeframe object the scanner hands to Phase 1.
 *
 * Structures are isolated per timeframe: a consumer must never index another
 * timeframe's candle array. Higher-timeframe confluence reaches the engines
 * only as price/timestamp/structured context, never as a foreign array index.
 */
export interface MarketContext {
  symbol: string;
  metadata: SymbolMetadata;
  d1: TimeframeContext;
  h4: TimeframeContext;
  h1: TimeframeContext;
  m15: TimeframeContext;
  latestPrice: number;
  spreadPips?: number;
  accountCurrency: string;
  /**
   * quote -> account conversion rate. Present whenever the quote currency
   * differs from the account currency and the rate could be resolved; absent
   * when no conversion is needed or when it could not be resolved (in which
   * the Risk Engine rejects rather than guessing).
   */
  quoteToAccountConversionRate?: number;
  source: string;
  receivedAt: number;
  /** UTC epoch ms of the market time this context describes. */
  marketTimestamp: number;
  freshness: Freshness;
}

// ---------------------------------------------------------------------------
// Signal lifecycle
// ---------------------------------------------------------------------------

/**
 * Deterministic identity for one setup lifecycle.
 *
 * Identity follows the setup, not the scan: the same live setup must keep the
 * same id across cycles so the dashboard and the state history see continuity
 * instead of a new signal on every tick.
 *
 * Identity is defined by WHAT the setup is and WHEN it formed:
 *   symbol + strategy + direction + origin timeframe + origin timestamp + zone bounds.
 * The origin timestamp is the market time of the candle the setup/zone first
 * appeared on. It is what separates two occurrences of the identical zone at
 * different times - without it, a recurring zone would collapse into one signal
 * and its history would be silently overwritten.
 */
export interface SignalIdentity {
  signalId: string;
  symbol: string;
  /**
   * Strategy that owns this lifecycle. Optional for pre-multi-strategy
   * persisted identities.
   */
  strategyId?: string | null;
  direction: import("@/types/market").Direction;
  /** Timeframe the setup/zone originated on. */
  originTimeframe: Timeframe;
  /**
   * Market timestamp (UTC epoch ms) of the candle the setup/zone originated on.
   * Always a real market time, never a derived price or pip value.
   */
  originTimestamp: number;
  /** Quantized lower zone bound, in pips. */
  zoneLowPips: number;
  /** Quantized upper zone bound, in pips. */
  zoneHighPips: number;
}

/** One recorded state transition in a signal's lifecycle. */
export interface SignalStateTransition {
  signalId: string;
  symbol: string;
  previousState: import("@/types/market").SignalState | null;
  newState: import("@/types/market").SignalState;
  /** UTC epoch ms the transition was recorded. */
  timestamp: number;
  /** Machine-readable reason the transition happened. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Economic calendar (contract only)
// ---------------------------------------------------------------------------

/**
 * How thoroughly economic-news risk was actually assessed for a symbol.
 *
 * The distinction matters for safety: "checked and no news" is a green light,
 * "not checked at all" is not. A provider that cannot evaluate news must say so
 * with {@link NewsEvaluationStatus.NOT_EVALUATED} rather than reporting an empty
 * news window, so the Phase 1 NEWS_BLOCK veto stays skipped instead of being
 * falsely satisfied.
 */
export type NewsEvaluationStatus =
  /** A calendar provider actually checked; the result reflects real events. */
  | "EVALUATED"
  /** News risk was deliberately skipped (no provider configured). */
  | "SKIPPED"
  /** A provider is configured but could not answer for this symbol/time. */
  | "PROVIDER_UNAVAILABLE";

/**
 * High-impact news context the veto framework consumes.
 *
 * `newsPending` is meaningful only when {@link evaluationStatus} is EVALUATED;
 * otherwise it is absent so consumers cannot mistake "not checked" for "clear".
 */
export interface NewsRiskContext {
  evaluationStatus: NewsEvaluationStatus;
  /** True when high-impact news is due within the block window (EVALUATED only). */
  newsPending?: boolean;
  /** UTC epoch ms of the next high-impact event, when known. */
  nextEventAt?: number;
  /** Human-readable label of the next event, when known. */
  nextEventLabel?: string;
}

export interface EconomicCalendarProvider {
  readonly id: string;
  /** News risk for one symbol at a point in time. */
  getNewsRisk(symbol: string, asOf?: number): Promise<ProviderResult<NewsRiskContext>>;
  getProviderStatus(): ProviderStatus;
}

// ---------------------------------------------------------------------------
// Execution mode (re-exported for the scanner boundary)
// ---------------------------------------------------------------------------

export type { ExecutionMode };
