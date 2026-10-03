/**
 * Core market-data domain types (Phase 1).
 *
 * Provider-agnostic: any market-data feed is normalized into these shapes before
 * the trading engines ever see it. Nothing in `src/core` imports a vendor SDK.
 */

export type Timeframe =
  | "M1"
  | "M5"
  | "M15"
  | "M30"
  | "H1"
  | "H4"
  | "D1"
  | "W1"
  | "MN";

/** A tradeable currency pair, including the metadata the Risk Engine needs. */
export interface CurrencyPair {
  code: string;
  base: string;
  quote: string;
  name?: string;
  /** Smallest price increment, e.g. 0.0001 for EURUSD, 0.01 for USDJPY. */
  pipSize: number;
  /** Notional per 1.0 lot, e.g. 100_000 for a standard FX lot. */
  contractSize: number;
  /** Decimal places for display/rounding. */
  digits?: number;
  /** Smallest tradeable increment, in lots (defaults to 0.01 = micro lot). */
  minLot?: number;
  /** Largest position the broker allows on this instrument, in lots. */
  maxLot?: number;
  /** Lot increment the broker accepts, e.g. 0.01 or 0.1. */
  lotStep?: number;
}

/** A single OHLCV candle. Timestamps are UTC epoch milliseconds. */
export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Normalized market-data snapshot for one pair on one timeframe.
 */
export interface MarketSnapshot {
  pair: string;
  timeframe: Timeframe;
  candles: OHLCV[];
  /** UTC epoch milliseconds of the most recent closed candle. */
  asOf: number;
  /** Current spread in pips, when the provider exposes it. */
  spreadPips?: number;
}

export type Direction = "LONG" | "SHORT" | "NEUTRAL";

/** Domain regime classification (Section 2 spec). */
export type MarketRegime =
  | "TREND_UP"
  | "TREND_DOWN"
  | "RANGE"
  | "BREAKOUT"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY";

/**
 * The richer 8-value label emitted by the Regime Engine (Section 6 spec).
 * Every label maps down to a base {@link MarketRegime} and a {@link Direction}.
 */
export type RegimeLabel =
  | "STRONG_TREND_UP"
  | "TREND_UP"
  | "RANGE"
  | "TREND_DOWN"
  | "STRONG_TREND_DOWN"
  | "BREAKOUT"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY";

/** Lifecycle of a signal as it advances through the pipeline. */
export type SignalState =
  | "DISCOVERED"
  | "WATCH"
  | "SETUP"
  | "ARMED"
  | "TRIGGERED"
  | "RISK_APPROVED"
  | "EXECUTE"
  | "BLOCKED"
  | "INVALIDATED"
  | "MANAGE"
  | "CLOSED";

/** Five-level bias output (Section 7 spec). */
export type BiasLabel =
  | "STRONG_LONG"
  | "LONG"
  | "NEUTRAL"
  | "SHORT"
  | "STRONG_SHORT";

/** Setup Engine output states (Section 8 spec). */
export type SetupState =
  | "NONE"
  | "WATCH"
  | "SETUP"
  | "ARMED"
  | "INVALIDATED";

/** Trigger Engine output states (Section 9 spec). */
export type TriggerState = "WAITING" | "CONFIRMED" | "INVALIDATED";

/** Execution Engine decision (Section 11 spec). It decides, never executes. */
export type ExecutionDecision =
  | "WAIT"
  | "EXECUTE"
  | "BLOCKED"
  | "INVALIDATED";

/**
 * Operational mode of the deployment (Section 11 spec).
 *
 * Decision semantics fail closed for safety-critical missing data in LIVE mode,
 * while SIGNAL_ONLY and PAPER may report such checks as not evaluated. No mode
 * ever places an order - execution stays a downstream concern.
 */
export type ExecutionMode = "SIGNAL_ONLY" | "PAPER" | "LIVE";

/** Collapse a regime label to its base domain regime. */
export function regimeToBase(label: RegimeLabel): MarketRegime {
  switch (label) {
    case "STRONG_TREND_UP":
    case "TREND_UP":
      return "TREND_UP";
    case "STRONG_TREND_DOWN":
    case "TREND_DOWN":
      return "TREND_DOWN";
    case "BREAKOUT":
      return "BREAKOUT";
    case "HIGH_VOLATILITY":
      return "HIGH_VOLATILITY";
    case "LOW_VOLATILITY":
      return "LOW_VOLATILITY";
    case "RANGE":
    default:
      return "RANGE";
  }
}

/** Direction implied by a regime label. */
export function regimeDirection(label: RegimeLabel): Direction {
  switch (label) {
    case "STRONG_TREND_UP":
    case "TREND_UP":
      return "LONG";
    case "STRONG_TREND_DOWN":
    case "TREND_DOWN":
      return "SHORT";
    default:
      return "NEUTRAL";
  }
}

/** Map a signed bias score (-100..+100) to its five-level label. */
export function biasLabelFromScore(score: number): BiasLabel {
  if (score >= 60) return "STRONG_LONG";
  if (score >= 20) return "LONG";
  if (score > -20) return "NEUTRAL";
  if (score > -60) return "SHORT";
  return "STRONG_SHORT";
}

/** Sign of a bias label: +1 long, -1 short, 0 neutral. */
export function biasDirection(label: BiasLabel): Direction {
  switch (label) {
    case "STRONG_LONG":
    case "LONG":
      return "LONG";
    case "STRONG_SHORT":
    case "SHORT":
      return "SHORT";
    default:
      return "NEUTRAL";
  }
}
