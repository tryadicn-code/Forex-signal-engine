import type { OHLCV, Direction } from "@/types/market";
import type {
  EngineResult,
  Evidence,
  SetupResultData,
  StructureResultData,
  TriggerBreakdown,
  TriggerComponentState,
  TriggerResultData,
} from "@/types/engine";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import { engineTimestamp, last, macd, rsi } from "@/core/indicators";

/** Component contributions to the composite trigger score. */
const SCORE_STRUCTURAL = 50;
const SCORE_LOCATION = 30;
const SCORE_CANDLE = 10;
const SCORE_MOMENTUM = 10;

/**
 * Trigger Engine (Section 9 spec).
 *
 * Only ever evaluated once the Setup Engine reports a valid zone. It looks for
 * the specific, named evidence that turns a zone into an entry.
 *
 * Composite model (audit finding #5): a trigger is never the first matching
 * item in a list. Confirmation requires
 *
 *   structural confirmation (BOS / CHOCH / reclaim in the trade direction)
 *     + location validation (price inside, or retesting, the setup zone)
 *     + enough optional confirmation (engulfing / rejection / momentum)
 *
 * scored so that the structural and location gates are mandatory while the
 * candle and momentum evidence merely strengthen the result. Momentum alone
 * can never confirm, and a rejection wick printed outside the setup zone can
 * never confirm, because the location gate is worth more than every optional
 * component combined.
 *
 * Freshness (audit finding #6): the structural event must be recent enough to
 * still be actionable, and the result exposes `triggerIndex`,
 * `triggerTimestamp` and `ageInBars` so a state machine can enforce a TTL.
 */
export function evaluateTrigger(
  candles: OHLCV[],
  setup: SetupResultData,
  structure: StructureResultData,
  direction: Direction,
  configOverrides?: DeepPartial<EngineConfig>,
  /** Market time used for the result timestamp, for deterministic replay. */
  marketAsOf?: number
): EngineResult<TriggerResultData> {
  const config = resolveConfig(configOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const long = direction === "LONG";
  const price = last(candles.map((c) => c.close)) ?? 0;
  const lastIndex = candles.length - 1;

  const structural = detectStructural(
    structure,
    direction,
    candles,
    config.trigger.maxTriggerAgeBars
  );
  const location = detectLocation(candles, setup, long);
  const candleEvidence = detectCandle(candles, long, config);
  const momentum = momentumReadings(candles, direction, config);

  const score = Math.min(
    100,
    (structural.fired ? SCORE_STRUCTURAL : 0) +
      (location.fired ? SCORE_LOCATION : 0) +
      (candleEvidence.fired ? SCORE_CANDLE : 0) +
      (momentum.aligned ? SCORE_MOMENTUM : 0)
  );

  const breakdown: TriggerBreakdown = {
    structural,
    location,
    candle: candleEvidence,
    momentum,
    score,
  };

  // A zone that has already been blown through cannot trigger, whatever the
  // composite score says.
  const invalidated = long
    ? price < setup.invalidationLevel
    : price > setup.invalidationLevel;

  if (invalidated) {
    conflicts.push({
      code: "INVALIDATED",
      label: "Setup invalidated",
      description: `Price ${price} is beyond the invalidation level ${setup.invalidationLevel}.`,
    });
    return triggerResult("INVALIDATED", breakdown, null, null, null, null, evidence, conflicts, marketAsOf);
  }

  const confirmed =
    structural.fired && location.fired && score >= config.trigger.minTriggerScore;

  const firedComponents = [structural, location, candleEvidence].filter(
    (component) => component.fired && component.index !== null
  );
  const triggerIndex = confirmed
    ? Math.max(...firedComponents.map((component) => component.index as number))
    : null;
  const triggerTimestamp =
    triggerIndex !== null && candles[triggerIndex] !== undefined
      ? candles[triggerIndex].timestamp
      : null;
  const ageInBars =
    triggerIndex !== null ? lastIndex - triggerIndex : null;

  const triggerType = confirmed
    ? `${structural.name}+${location.name}`
    : null;

  for (const [component, label] of [
    [structural, "structural"],
    [location, "location"],
    [candleEvidence, "candle"],
  ] as const) {
    evidence.push({
      code: component.fired
        ? `TRIGGER_${label.toUpperCase()}_${component.name}`
        : `TRIGGER_${label.toUpperCase()}_MISS`,
      label: component.fired
        ? `${label}: ${component.name}`
        : `${label} not confirmed`,
      description: component.fired
        ? `${component.name} fired at bar ${component.index}.`
        : `No ${label} confirmation on the latest closed candles.`,
      value: component.name ?? undefined,
    });
  }
  evidence.push({
    code: momentum.aligned ? "TRIGGER_MOMENTUM_ALIGNED" : "TRIGGER_MOMENTUM_MISS",
    label: "momentum",
    description: `RSI ${momentum.rsi.toFixed(1)} and MACD histogram ${momentum.macdHistogram.toFixed(5)} are${momentum.aligned ? "" : " not"} aligned with ${direction}.`,
    value: momentum.aligned,
  });
  evidence.push({
    code: "TRIGGER_SCORE",
    label: "Composite trigger score",
    description: `Composite score ${score} (structural ${structural.fired ? SCORE_STRUCTURAL : 0} + location ${location.fired ? SCORE_LOCATION : 0} + candle ${candleEvidence.fired ? SCORE_CANDLE : 0} + momentum ${momentum.aligned ? SCORE_MOMENTUM : 0}) against minimum ${config.trigger.minTriggerScore}.`,
    value: score,
  });

  if (!confirmed) {
    conflicts.push({
      code: "TRIGGER_INCOMPLETE",
      label: "Trigger not fully confirmed",
      description: `Score ${score} needs a structural break, location validation and at least ${config.trigger.minTriggerScore} points.`,
      value: score,
    });
  }

  const state = confirmed ? "CONFIRMED" : "WAITING";
  return triggerResult(
    state,
    breakdown,
    triggerType,
    triggerIndex,
    triggerTimestamp,
    ageInBars,
    evidence,
    conflicts,
    marketAsOf
  );
}

function triggerResult(
  state: TriggerResultData["state"],
  breakdown: TriggerBreakdown,
  triggerType: string | null,
  triggerIndex: number | null,
  triggerTimestamp: number | null,
  ageInBars: number | null,
  evidence: Evidence[],
  conflicts: Evidence[],
  marketAsOf?: number
): EngineResult<TriggerResultData> {
  return {
    status: `TRIGGER_${state}`,
    score: state === "CONFIRMED" ? breakdown.score : 0,
    evidence,
    conflicts,
    data: {
      state,
      triggerType,
      triggerIndex,
      triggerTimestamp,
      ageInBars,
      breakdown,
    },
    timestamp: engineTimestamp(marketAsOf),
  };
}

/**
 * Structural confirmation: the most recent BOS / CHOCH in the trade direction,
 * or a reclaim of the last broken level. Stale events do not fire - a break
 * from many bars ago must not silently trigger a fresh execution.
 */
function detectStructural(
  structure: StructureResultData,
  direction: Direction,
  candles: OHLCV[],
  maxAgeBars: number
): TriggerComponentState {
  const lastIndex = candles.length - 1;
  const candidates: Array<{ name: string; index: number }> = [];

  if (structure.lastBOS && structure.lastBOS.direction === direction) {
    candidates.push({ name: "BOS", index: structure.lastBOS.index });
  }
  if (structure.lastCHOCH && structure.lastCHOCH.direction === direction) {
    candidates.push({ name: "CHOCH", index: structure.lastCHOCH.index });
  }

  // Reclaim: the most recent break was against the trade direction, but price
  // has since closed back beyond that level, taking it back.
  const lastBreak =
    structure.breakEvents[structure.breakEvents.length - 1] ?? null;
  if (lastBreak && lastBreak.direction !== direction && lastIndex >= 0) {
    const close = candles[lastIndex].close;
    const reclaimed =
      direction === "LONG" ? close > lastBreak.price : close < lastBreak.price;
    if (reclaimed) {
      candidates.push({ name: "RECLAIM", index: lastIndex });
    }
  }

  if (candidates.length === 0) {
    return { name: null, fired: false, index: null, timestamp: null };
  }
  const best = candidates.reduce((a, b) => (b.index > a.index ? b : a));
  const ageInBars = lastIndex - best.index;
  const fired = ageInBars <= maxAgeBars;
  return {
    name: best.name,
    fired,
    index: best.index,
    timestamp: candles[best.index].timestamp,
  };
}

/** Location validation: price is inside the setup zone, or retesting it. */
function detectLocation(
  candles: OHLCV[],
  setup: SetupResultData,
  long: boolean
): TriggerComponentState {
  const n = candles.length;
  if (n === 0) return { name: null, fired: false, index: null, timestamp: null };
  const current = candles[n - 1];

  const insideZone =
    current.close >= setup.zoneLow && current.close <= setup.zoneHigh;
  if (insideZone) {
    return { name: "IN_ZONE", fired: true, index: n - 1, timestamp: current.timestamp };
  }

  // Retest: the candle swept into the zone and was rejected, closing back on
  // the entry side of it - demand at the zone for a long, supply for a short.
  const swept = long
    ? current.low <= setup.zoneHigh
    : current.high >= setup.zoneLow;
  const rejected = long
    ? current.close > setup.zoneHigh
    : current.close < setup.zoneLow;
  const held = long ? current.close > current.open : current.close < current.open;
  if (swept && rejected && held) {
    return { name: "RETEST", fired: true, index: n - 1, timestamp: current.timestamp };
  }

  return { name: "OUTSIDE", fired: false, index: n - 1, timestamp: current.timestamp };
}

/** Optional candle confirmation: engulfing, then rejection, strongest first. */
function detectCandle(
  candles: OHLCV[],
  long: boolean,
  config: EngineConfig
): TriggerComponentState {
  const engulf = engulfing(candles, long, config.trigger.engulfMinBodyRatio);
  if (engulf.fired && engulf.index !== null) {
    return {
      name: "ENGULFING",
      fired: true,
      index: engulf.index,
      timestamp: candles[engulf.index].timestamp,
    };
  }
  const rejection = rejectionCandle(candles, long, config.trigger.rejectionWickRatio);
  if (rejection.fired && rejection.index !== null) {
    return {
      name: "REJECTION",
      fired: true,
      index: rejection.index,
      timestamp: candles[rejection.index].timestamp,
    };
  }
  return { name: null, fired: false, index: null, timestamp: null };
}

interface CandleCheck {
  fired: boolean;
  index: number | null;
  describe: () => string;
}

/** Classic two-candle engulfing pattern in the trade direction. */
function engulfing(
  candles: OHLCV[],
  long: boolean,
  minBodyRatio: number
): CandleCheck {
  const n = candles.length;
  if (n < 2) return notFired("Not enough candles");
  const prev = candles[n - 2];
  const curr = candles[n - 1];
  const prevBody = prev.close - prev.open;
  const currBody = curr.close - curr.open;
  const prevRange = Math.max(prev.high - prev.low, 1e-9);

  const bullish = prevBody < 0 && currBody > 0 && curr.close > prev.high;
  const bearish = prevBody > 0 && currBody < 0 && curr.close < prev.low;
  const strongBody = Math.abs(currBody) / prevRange >= minBodyRatio;

  const fired = (long ? bullish : bearish) && strongBody;
  return {
    fired,
    index: fired ? n - 1 : null,
    describe: () =>
      `Candle ${n - 1} engulfs candle ${n - 2} (${long ? "bullish" : "bearish"}) with body ${(
        (Math.abs(currBody) / prevRange) *
        100
      ).toFixed(0)}% of range.`,
  };
}

/** Pin-bar / rejection wick at the zone edge. */
function rejectionCandle(
  candles: OHLCV[],
  long: boolean,
  wickRatio: number
): CandleCheck {
  const n = candles.length;
  if (n === 0) return notFired("No candles");
  const c = candles[n - 1];
  const body = Math.abs(c.close - c.open);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  if (body <= 0) return notFired("Doji candle, no body");

  const wick = long ? lowerWick : upperWick;
  const fired = wick >= wickRatio * body;
  return {
    fired,
    index: fired ? n - 1 : null,
    describe: () =>
      `Candle ${n - 1} shows a ${long ? "lower" : "upper"} rejection wick of ${wick.toFixed(5)} vs body ${body.toFixed(5)} (ratio ${(wick / body).toFixed(2)}).`,
  };
}

/** RSI and MACD readings backing the optional momentum component. */
function momentumReadings(
  candles: OHLCV[],
  direction: Direction,
  config: EngineConfig
): TriggerBreakdown["momentum"] {
  const px = candles.map((c) => c.close);
  const rsiValue = last(rsi(candles, config.indicators.rsiPeriod)) ?? 50;
  const hist =
    last(
      macd(
        px,
        config.indicators.macdFast,
        config.indicators.macdSlow,
        config.indicators.macdSignal
      ).histogram
    ) ?? 0;

  const long = direction === "LONG";
  const aligned = long
    ? rsiValue > 50 && hist > 0
    : rsiValue < 50 && hist < 0;
  return { rsi: rsiValue, macdHistogram: hist, aligned };
}

function notFired(reason: string): CandleCheck {
  return { fired: false, index: null, describe: () => reason };
}

