import type { OHLCV } from "@/types/market";
import type {
  BiasComponent,
  BiasResultData,
  EngineResult,
  Evidence,
  RegimeResultData,
  StructureResultData,
} from "@/types/engine";
import type { BiasLabel, Direction } from "@/types/market";
import { biasDirection } from "@/types/market";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import { clamp, ema, engineTimestamp, last, macd, rsi } from "@/core/indicators";

/**
 * Bias Engine (Section 7 spec).
 *
 * Scores four independent factors, each on a -100..+100 scale, then combines
 * them with configurable weights (Section 7 defaults: structure 35, trend 25,
 * regime 20, momentum 20). Fundamentals are accepted through a placeholder
 * interface and contribute 0 weight until a real provider exists.
 *
 * ---------------------------------------------------------------------------
 * Component dependency graph (documented for audit finding #12)
 * ---------------------------------------------------------------------------
 * structure - swing sequence (HH/HL/LH/LL) direction scaled by structure
 *             strength, plus the last BOS/CHOCH. Input: StructureResultData.
 * trend      - EMA stack (20/50/200) alignment and price position vs EMA20.
 *             Input: candles only. It re-derives EMA state itself so it stays
 *             meaningful even when structure is neutral.
 * regime     - Regime Engine output (direction x strength). The Regime Engine
 *             itself consumes the EMA stack AND market structure, so this
 *             component is correlated with the other two by construction.
 * momentum   - RSI distance from 50 and MACD histogram sign. Independent of
 *             the other three (a different indicator family).
 *
 * Known correlation: regime double counts information already present in
 * structure and trend, because the Regime Engine is itself a combination of the
 * EMA stack and the structure trend. This is deliberate, not an oversight:
 *  - It lets bias reflect the market CLASSIFICATION (is this a trend at all?)
 *    and not only its direction, which is what a trader needs before hunting a
 *    setup.
 *  - The correlated component is capped at 20 percent of the total, and every
 *    component is clamped to -100..+100, so it cannot dominate the score.
 *
 * The weights are spec-mandated (35/25/20/20) and are never tuned to fit data.
 * If the correlation is later judged excessive, the spec-correct remedy is to
 * turn the Regime Engine into a modifier (for example scaling the other
 * components by regime strength) rather than re-tuning these weights. This
 * graph exists so that dependency stays explicit and auditable.
 */
export function analyzeBias(
  candles: OHLCV[],
  structure: StructureResultData,
  regime: RegimeResultData,
  configOverrides?: DeepPartial<EngineConfig>,
  /** Market time used for the result timestamp, for deterministic replay. */
  marketAsOf?: number
): EngineResult<BiasResultData> {
  const config = resolveConfig(configOverrides);
  const weights = config.bias.weights;
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];

  const components: Record<BiasComponent, number> = {
    structure: structureScore(structure, evidence, conflicts),
    trend: trendScore(candles, config, evidence),
    regime: regimeScore(regime, evidence),
    momentum: momentumScore(candles, config, evidence),
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  let score = 0;
  (Object.keys(components) as BiasComponent[]).forEach((key) => {
    score += components[key] * weights[key];
  });
  score = clamp(Math.round(score / totalWeight), -100, 100);

  const label = labelFromScore(score, config);
  const direction: Direction = biasDirection(label);

  evidence.push({
    code: "WEIGHTED_SUM",
    label: "Weighted bias score",
    description: `Weighted sum of structure (${weights.structure}), trend (${weights.trend}), regime (${weights.regime}), momentum (${weights.momentum}) = ${score}.`,
    value: score,
  });

  if (label === "NEUTRAL") {
    conflicts.push({
      code: "NEUTRAL_BIAS",
      label: "Bias is neutral",
      description: `Score ${score} does not clear the +/-${config.bias.biasThreshold} threshold for a directional bias.`,
    });
  }

  const data: BiasResultData = {
    label,
    direction,
    score,
    components,
    weights,
  };

  return {
    status: `BIAS_${label}`,
    score: Math.abs(score),
    confidence: Math.abs(score),
    evidence,
    conflicts,
    data,
    timestamp: engineTimestamp(marketAsOf),
  };
}

function labelFromScore(score: number, config: EngineConfig): BiasLabel {
  const strong = config.bias.strongThreshold;
  const weak = config.bias.biasThreshold;
  if (score >= strong) return "STRONG_LONG";
  if (score >= weak) return "LONG";
  if (score <= -strong) return "STRONG_SHORT";
  if (score <= -weak) return "SHORT";
  return "NEUTRAL";
}

/** Structure factor: trend direction scaled by structure strength, +/- BOS/CHOCH. */
function structureScore(
  structure: StructureResultData,
  evidence: Evidence[],
  conflicts: Evidence[]
): number {
  const sign = structure.trend === "LONG" ? 1 : structure.trend === "SHORT" ? -1 : 0;
  let value = sign * structure.trendStrength;

  if (structure.lastBOS) {
    value += 15 * (structure.lastBOS.direction === "LONG" ? 1 : -1);
  }
  if (structure.lastCHOCH) {
    value += 10 * (structure.lastCHOCH.direction === "LONG" ? 1 : -1);
  }

  value = clamp(value, -100, 100);

  evidence.push({
    code: "BIAS_STRUCTURE",
    label: "Structure component",
    description: `Structure trend ${structure.trend} at strength ${structure.trendStrength.toFixed(0)}${structure.lastBOS ? `, last BOS ${structure.lastBOS.direction}` : ""}${structure.lastCHOCH ? `, last CHOCH ${structure.lastCHOCH.direction}` : ""}.`,
    value,
  });

  if (structure.lastBOS && structure.lastCHOCH) {
    conflicts.push({
      code: "BOS_AND_CHOCH_CONFLICT",
      label: "Both BOS and CHOCH present",
      description: "Continuation and reversal signals both fired recently; structure is transitional.",
    });
  }

  return value;
}

/** Trend factor: EMA stack alignment plus price position relative to the EMAs. */
function trendScore(
  candles: OHLCV[],
  config: EngineConfig,
  evidence: Evidence[]
): number {
  const px = candles.map((c) => c.close);
  const emaShort = last(ema(px, config.indicators.emaShort)) ?? px[0];
  const emaMid = last(ema(px, config.indicators.emaMid)) ?? px[0];
  const emaLong = last(ema(px, config.indicators.emaLong)) ?? px[0];
  const price = last(px) ?? 0;

  const stack = (emaShort > emaMid ? 1 : -1) + (emaMid > emaLong ? 1 : -1);
  let value = (stack / 2) * 70;
  value += price > emaShort ? 15 : -15;
  value += emaShort > emaMid ? 15 : -15;
  value = clamp(value, -100, 100);

  evidence.push({
    code: "BIAS_TREND",
    label: "Trend component",
    description: `EMA stack ${stack > 0 ? "bullish" : stack < 0 ? "bearish" : "mixed"}, price ${price > emaShort ? "above" : "below"} EMA${config.indicators.emaShort}.`,
    value,
  });

  return value;
}



/** Regime factor: regime direction scaled by classification strength. */
function regimeScore(regime: RegimeResultData, evidence: Evidence[]): number {
  const sign =
    regime.direction === "LONG" ? 1 : regime.direction === "SHORT" ? -1 : 0;
  const value = clamp(sign * regime.strength, -100, 100);

  evidence.push({
    code: "BIAS_REGIME",
    label: "Regime component",
    description: `Regime ${regime.regime} (direction ${regime.direction}, strength ${regime.strength}).`,
    value,
  });

  return value;
}

/** Momentum factor: RSI distance from midpoint plus MACD histogram sign. */
function momentumScore(
  candles: OHLCV[],
  config: EngineConfig,
  evidence: Evidence[]
): number {
  const px = candles.map((c) => c.close);
  const rsiValue = last(rsi(candles, config.indicators.rsiPeriod)) ?? 50;
  const rsiComponent = clamp((rsiValue - 50) * 4, -100, 100);

  const macdResult = macd(
    px,
    config.indicators.macdFast,
    config.indicators.macdSlow,
    config.indicators.macdSignal
  );
  const hist = last(macdResult.histogram) ?? 0;
  const price = last(px) ?? 1;
  const macdNorm = (hist / price) * 10_000;
  const macdComponent = clamp(macdNorm * 10, -60, 60);

  const value = clamp(
    Math.round(0.6 * rsiComponent + 0.4 * macdComponent),
    -100,
    100
  );

  evidence.push({
    code: "BIAS_MOMENTUM",
    label: "Momentum component",
    description: `RSI ${rsiValue.toFixed(1)} contributes ${rsiComponent.toFixed(0)}; MACD histogram ${hist.toFixed(5)} contributes ${macdComponent.toFixed(0)}.`,
    value,
  });

  return value;
}
