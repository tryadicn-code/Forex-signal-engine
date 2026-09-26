import type { OHLCV } from "@/types/market";
import type {
  BiasResultData,
  EngineResult,
  Evidence,
  SetupResultData,
  StructureResultData,
} from "@/types/engine";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import { atr, ema, engineTimestamp, last } from "@/core/indicators";

interface CandidateZone {
  low: number;
  high: number;
  source: string;
}

/**
 * Setup Engine (Section 8 spec).
 *
 * Given a directional bias it builds candidate demand/supply zones from every
 * source in the spec - horizontal support/resistance, EMA dynamic location, the
 * previous swing high/low, retracement zones and simple supply/demand - then
 * selects the nearest actionable one on the correct side of price.
 *
 * A setup never becomes a trade by itself: it only reports whether price is
 * approaching, sitting in, or armed on a zone.
 *
 * Timeframe isolation (audit finding #1): the `structure` argument MUST come
 * from the same candle array the setup engine is given, because zone builders
 * resolve swing *levels* and, for the supply/demand base candle, look the
 * swing pivot up in this same array. A higher timeframe may still contribute
 * confluence, but only through price - never through an array index, which
 * would silently point at an unrelated candle.
 */
export function analyzeSetup(
  candles: OHLCV[],
  bias: BiasResultData,
  structure: StructureResultData,
  pipSize = 0.0001,
  configOverrides?: DeepPartial<EngineConfig>,
  /** Optional structure from a different timeframe, used as price-only confluence. */
  confluenceStructure?: StructureResultData,
  /** Market time used for the result timestamp, for deterministic replay. */
  marketAsOf?: number
): EngineResult<SetupResultData> {
  const config = resolveConfig(configOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];

  const price = last(candles.map((c) => c.close)) ?? 0;
  const lookback = Math.min(
    config.setup.zoneLookback,
    Math.max(1, candles.length)
  );

  const empty: EngineResult<SetupResultData> = {
    status: "SETUP_NONE",
    score: 0,
    evidence,
    conflicts,
    data: {
      state: "NONE",
      zoneLow: 0,
      zoneHigh: 0,
      distanceToZone: 0,
      setupType: "none",
      setupScore: 0,
      invalidationLevel: 0,
      zoneSource: "none",
    },
    timestamp: engineTimestamp(marketAsOf),
  };

  if (bias.direction === "NEUTRAL") {
    evidence.push({
      code: "NEUTRAL_BIAS",
      label: "Bias is neutral",
      description: "No directional bias, so no setup is sought.",
    });
    return empty;
  }

  const long = bias.direction === "LONG";
  const zones = buildZones(
    candles,
    structure,
    confluenceStructure,
    long,
    config,
    evidence,
    lookback
  );

  if (zones.length === 0) {
    evidence.push({
      code: "NO_ZONE",
      label: "No candidate zone",
      description: "Zone builders produced no candidates in the lookback.",
    });
    return empty;
  }

  // Nearest zone on the correct side of price (below for longs, above for
  // shorts). Distance is signed on purpose: a zone on the wrong side of price
  // is negative and is dropped, instead of being clamped to zero and ranking
  // as if it sat right under price (audit finding #2).
  const sorted = zones
    .map((zone) => {
      const insideZone = price >= zone.low && price <= zone.high;
      return {
        zone,
        distance: insideZone
          ? 0
          : long
            ? price - zone.high
            : zone.low - price,
      };
    })
    .filter((candidate) => candidate.distance >= 0)
    .sort((a, b) => a.distance - b.distance);

  const selected = sorted[0];
  if (!selected) {
    evidence.push({
      code: "NO_ZONE_ON_SIDE",
      label: "No zone on the correct side",
      description: `All candidate zones sit on the wrong side of price (${price}).`,
    });
    return empty;
  }

  const { zone } = selected;
  const zoneWidth = Math.max(zone.high - zone.low, pipSize);
  const invalidationLevel = long
    ? zone.low - config.setup.invalidationBufferPips * pipSize
    : zone.high + config.setup.invalidationBufferPips * pipSize;

  const distancePips = selected.distance / pipSize;
  const proximityPips = config.setup.zoneProximityPips;

  let state: SetupResultData["state"];
  if (long ? price < invalidationLevel : price > invalidationLevel) {
    state = "INVALIDATED";
    conflicts.push({
      code: "ZONE_INVALIDATED",
      label: "Zone invalidated",
      description: `Price ${price} closed beyond the invalidation level ${invalidationLevel}.`,
    });
  } else if (price >= zone.low && price <= zone.high) {
    const fromEntryEdge = long
      ? (zone.high - price) / zoneWidth
      : (price - zone.low) / zoneWidth;
    state = fromEntryEdge <= config.setup.armThresholdRatio ? "ARMED" : "SETUP";
    evidence.push({
      code: "PRICE_IN_ZONE",
      label: "Price inside the zone",
      description: `Close ${price} sits inside [${zone.low}, ${zone.high}] (${(fromEntryEdge * 100).toFixed(0)}% from the entry edge).`,
      value: fromEntryEdge,
    });
  } else if (distancePips <= proximityPips) {
    state = "WATCH";
    evidence.push({
      code: "APPROACHING_ZONE",
      label: "Approaching the zone",
      description: `Price is ${distancePips.toFixed(1)} pips from the zone edge (proximity ${proximityPips} pips).`,
      value: distancePips,
    });
  } else {
    state = "NONE";
    evidence.push({
      code: "ZONE_TOO_FAR",
      label: "Zone too far",
      description: `Price is ${distancePips.toFixed(1)} pips from the zone, beyond the ${proximityPips}-pip proximity window.`,
      value: distancePips,
    });
  }

  const setupScore = computeSetupScore(
    distancePips,
    proximityPips,
    zones,
    selected.zone,
    Math.abs(bias.score)
  );

  // Minimum quality applies to every actionable state. Letting an ARMED zone
  // keep its state below the minimum would let a setup bypass the quality gate
  // merely because price happened to travel deeper into the zone (audit #7).
  if (
    (state === "SETUP" || state === "ARMED") &&
    setupScore < config.setup.minSetupScore
  ) {
    state = "WATCH";
    evidence.push({
      code: "SCORE_TOO_LOW",
      label: "Setup score below minimum",
      description: `Score ${setupScore} is below the ${config.setup.minSetupScore} threshold; downgraded to WATCH.`,
      value: setupScore,
    });
  }

  evidence.push({
    code: "SELECTED_ZONE",
    label: `Selected ${long ? "demand" : "supply"} zone`,
    description: `Zone [${zone.low}, ${zone.high}] from source "${zone.source}" selected among ${zones.length} candidates.`,
    value: zone.source,
  });

  const data: SetupResultData = {
    state,
    zoneLow: zone.low,
    zoneHigh: zone.high,
    distanceToZone: Math.round(distancePips * 10) / 10,
    setupType: zone.source,
    setupScore,
    invalidationLevel,
    zoneSource: zone.source,
  };

  return {
    status: `SETUP_${state}`,
    score: setupScore,
    evidence,
    conflicts,
    data,
    timestamp: engineTimestamp(marketAsOf),
  };
}

function buildZones(
  candles: OHLCV[],
  structure: StructureResultData,
  confluenceStructure: StructureResultData | undefined,
  long: boolean,
  config: EngineConfig,
  evidence: Evidence[],
  lookback: number
): CandidateZone[] {
  const zones: CandidateZone[] = [];
  const px = candles.map((c) => c.close);
  const atrValue = last(atr(candles, config.indicators.atrPeriod)) ?? 0;
  const buffer = Math.max(atrValue * 0.2, 0);
  const fromIndex = Math.max(0, candles.length - lookback);

  // Only swings inside the configured lookback window become levels.
  const inWindow = (index: number) => index >= fromIndex;

  const swingPoints = (long ? structure.swingLows : structure.swingHighs).filter(
    (swing) => inWindow(swing.index)
  );

  // 1 + 3. Horizontal support/resistance from swings, incl. the previous swing.
  for (const swing of swingPoints) {
    zones.push({
      low: swing.price - buffer,
      high: swing.price + buffer,
      source: long ? "support-swing-low" : "resistance-swing-high",
    });
  }

  // 2. EMA dynamic location.
  const emaMid = last(ema(px, config.indicators.emaMid)) ?? px[0];
  zones.push({
    low: emaMid - buffer,
    high: emaMid + buffer,
    source: "ema-dynamic",
  });

  // 4. Retracement zone of the last impulse.
  const swingHigh = structure.lastSwingHigh;
  const swingLow = structure.lastSwingLow;
  if (swingHigh && swingLow) {
    const range = swingHigh.price - swingLow.price;
    if (range > 0) {
      if (long) {
        zones.push({
          low: swingHigh.price - range * 0.618,
          high: swingHigh.price - range * 0.382,
          source: "retracement",
        });
      } else {
        zones.push({
          low: swingLow.price + range * 0.382,
          high: swingLow.price + range * 0.618,
          source: "retracement",
        });
      }
    }
  }

  // 5. Simple supply/demand zone: the range of the last swing-base candle.
  // The pivot index addresses this same candle array, so the lookup is safe.
  const baseSwing = long ? structure.lastSwingLow : structure.lastSwingHigh;
  if (baseSwing && candles[baseSwing.index]) {
    const base = candles[baseSwing.index];
    zones.push({
      low: base.low,
      high: base.high,
      source: long ? "demand-zone" : "supply-zone",
    });
  }

  // 6. Higher-timeframe confluence, by price only. The swing levels of another
  // timeframe are meaningful where they sit, never at which bar they formed,
  // so nothing from the other timeframe is ever used as an array index here.
  if (confluenceStructure) {
    const htfSwing = long
      ? confluenceStructure.lastSwingLow
      : confluenceStructure.lastSwingHigh;
    if (htfSwing) {
      const candidate: CandidateZone = {
        low: htfSwing.price - buffer,
        high: htfSwing.price + buffer,
        source: "htf-confluence",
      };
      const centre = (candidate.low + candidate.high) / 2;
      const duplicate = zones.some(
        (zone) =>
          Math.abs((zone.low + zone.high) / 2 - centre) <=
          zone.high - zone.low
      );
      if (!duplicate) zones.push(candidate);
    }
  }

  evidence.push({
    code: "ZONE_CANDIDATES",
    label: "Candidate zones built",
    description: `${zones.length} zones from support/resistance, EMA dynamic, retracement and supply/demand sources${confluenceStructure ? ", plus higher-timeframe confluence" : ""}.`,
    value: zones.length,
  });
  return zones;
}

function computeSetupScore(
  distancePips: number,
  proximityPips: number,
  zones: CandidateZone[],
  selected: CandidateZone,
  biasStrength: number
): number {
  const proximityRatio =
    proximityPips > 0 ? Math.max(0, 1 - distancePips / proximityPips) : 1;
  const proximityBonus = proximityRatio * 30;

  let confluence = 0;
  for (const zone of zones) {
    if (zone === selected) continue;
    const centerDistance = Math.abs((zone.low + zone.high) / 2 - (selected.low + selected.high) / 2);
    if (centerDistance <= Math.max(selected.high - selected.low, 0)) {
      confluence++;
    }
  }
  const confluenceBonus = Math.min(confluence * 8, 20);

  const biasBonus = Math.min(biasStrength * 0.1, 10);

  return Math.round(
    Math.max(0, Math.min(100, 40 + proximityBonus + confluenceBonus + biasBonus))
  );
}

