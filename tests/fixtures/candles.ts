import type { OHLCV, Timeframe } from "@/types/market";
import { mulberry32 } from "@/core/indicators";

const HOUR = 60 * 60 * 1000;
const BASE_TIME = Date.UTC(2024, 0, 1);

/**
 * Deterministic candle generators used across the test suite.
 *
 * Every generator is a pure function of its arguments, so a test that passes
 * today passes forever. The engines are pure too, so fixture shape alone
 * determines every engine output.
 */

interface OHLCVOptions {
  step?: number;
  amplitude?: number;
  /** Cycles per bar; a full cycle spans 2*PI/frequency bars. */
  frequency?: number;
  seed?: number;
}

function candle(
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
  timestamp: number,
  volume = 1000
): OHLCV {
  return { timestamp, open, high, low, close, volume };
}

/**
 * Rising series with a sinusoidal overlay.
 *
 * The drift dominates the amplitude so each successive swing high and swing low
 * still prints higher - a textbook uptrend that actually contains swings.
 */
export function bullishTrend(
  count = 120,
  start = 1.0,
  options: OHLCVOptions = {}
): OHLCV[] {
  const {
    step = 0.0007,
    amplitude = 0.005,
    frequency = Math.PI / 9,
  } = options;
  const interval = intervalFor("H4");
  const out: OHLCV[] = [];
  for (let i = 0; i < count; i++) {
    // open sits a fixed distance below close so candle highs/lows track the
    // close exactly; the swing detector then sees clean local extremes.
    const close = start + step * i + amplitude * Math.sin(i * frequency);
    const open = close - amplitude * 0.2;
    const high = close + amplitude * 0.1;
    const low = open - amplitude * 0.1;
    out.push(candle(i, open, high, low, close, BASE_TIME + i * interval));
  }
  return out;
}

/** Falling series with a sinusoidal overlay - a textbook downtrend with swings. */
export function bearishTrend(
  count = 120,
  start = 1.2,
  options: OHLCVOptions = {}
): OHLCV[] {
  const {
    step = 0.0007,
    amplitude = 0.005,
    frequency = Math.PI / 9,
  } = options;
  const interval = intervalFor("H4");
  const out: OHLCV[] = [];
  for (let i = 0; i < count; i++) {
    const close = start - step * i + amplitude * Math.sin(i * frequency);
    const open = close + amplitude * 0.2;
    const high = open + amplitude * 0.1;
    const low = close - amplitude * 0.1;
    out.push(candle(i, open, high, low, close, BASE_TIME + i * interval));
  }
  return out;
}

/**
 * Oscillating series inside a fixed band with no directional drift - a range.
 *
 * The oscillation period is deliberately short (10 bars): directional runs last
 * only ~5 bars, so ADX correctly decays to a non-trending reading and the EMA
 * stack stays clustered around the mean. A slow sinusoid (period ~38, as the
 * previous `sin(i / 6)` wave) prints 19-bar directional runs that are genuinely
 * indistinguishable from a trend, which is why ADX legitimately read 41.
 *
 * Every candle uses strict offsets from the close so neighbouring highs and
 * lows are always distinct - the swing detector needs clean local extremes -
 * and the whole series stays a pure function of its arguments.
 */
export function rangeSeries(
  count = 120,
  centre = 1.1,
  amplitude = 0.003,
  timeframe: Timeframe = "H4",
  seed = 42
): OHLCV[] {
  const period = 10;
  const interval = intervalFor(timeframe);
  const rand = mulberry32(seed);
  const out: OHLCV[] = [];
  for (let i = 0; i < count; i++) {
    const wave = Math.sin((i * 2 * Math.PI) / period) * amplitude * 0.5;
    const noise = (rand() - 0.5) * amplitude * 0.15;
    const close = centre + wave + noise;
    const open = close - amplitude * 0.06;
    const high = close + amplitude * 0.1;
    const low = open - amplitude * 0.1;
    out.push(candle(i, open, high, low, close, BASE_TIME + i * interval));
  }
  return out;
}

/**
 * Uptrend that pulls back into a demand zone, then resumes with a strong close
 * back above the recent swing high - the classic bias + setup + trigger shape.
 */
export function bullishTrendWithPullback(
  count = 120,
  start = 1.0,
  timeframe: Timeframe = "H4"
): OHLCV[] {
  const candles = bullishTrend(count - 14, start);
  const interval = intervalFor(timeframe);
  let last = candles[candles.length - 1].close;

  // Pullback: five falling bars sink into the zone.
  for (let i = 0; i < 5; i++) {
    const open = last;
    const close = last - 0.0012;
    candles.push(
      candle(
        candles.length,
        open,
        Math.max(open, close) + 0.0004,
        Math.min(open, close) - 0.0004,
        close,
        BASE_TIME + (candles.length + 1) * interval
      )
    );
    last = close;
  }

  // Resumption: one strong bullish bar closes back above the prior swing high.
  const open = last;
  const close = last + 0.006;
  candles.push(
    candle(
      candles.length,
      open,
      close + 0.0008,
      open - 0.0008,
      close,
      BASE_TIME + (candles.length + 1) * interval
    )
  );
  last = close;

  // Follow-through to confirm the break.
  for (let i = 0; i < 7; i++) {
    const o = last;
    const c = last + 0.0009;
    candles.push(
      candle(
        candles.length,
        o,
        c + 0.0004,
        o - 0.0004,
        c,
        BASE_TIME + (candles.length + 1) * interval
      )
    );
    last = c;
  }

  return candles;
}

function intervalFor(timeframe: Timeframe): number {
  switch (timeframe) {
    case "M1":
      return HOUR / 60;
    case "M5":
      return (HOUR / 60) * 5;
    case "M15":
      return (HOUR / 60) * 15;
    case "M30":
      return HOUR / 2;
    case "H1":
      return HOUR;
    case "H4":
      return HOUR * 4;
    case "D1":
      return HOUR * 24;
    case "W1":
      return HOUR * 24 * 7;
    case "MN":
    default:
      return HOUR * 24 * 30;
  }
}

/** A synthetic EURUSD instrument with standard lot metadata. */
export const EURUSD = {
  code: "EURUSD",
  base: "EUR",
  quote: "USD",
  name: "Euro / US Dollar",
  pipSize: 0.0001,
  contractSize: 100_000,
  digits: 5,
};

/** Attach the snapshot envelope to a candle series. */
export function snapshot(
  candles: OHLCV[],
  timeframe: Timeframe,
  pair = "EURUSD",
  asOf?: number
) {
  return {
    pair,
    timeframe,
    candles,
    asOf: asOf ?? candles[candles.length - 1].timestamp,
  };
}
