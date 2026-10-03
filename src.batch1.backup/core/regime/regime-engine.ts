import type { OHLCV } from "@/types/market";
import type {
  EngineResult,
  Evidence,
  RegimeResultData,
  StructureResultData,
} from "@/types/engine";
import {
  regimeToBase,
  regimeDirection,
  type Direction,
  type RegimeLabel,
} from "@/types/market";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import { adx, atr, bollingerBandWidth, ema, engineTimestamp, last, mean } from "@/core/indicators";

/**
 * Market Regime Engine (Section 6 spec).
 *
 * Combines the EMA stack (20/50/200), ADX, ATR, market structure and Bollinger
 * Band Width. No single indicator ever decides the regime alone: trend needs
 * agreement between the EMA stack and structure, strength needs ADX, and the
 * volatility/breakout labels are only reachable when trend evidence is absent.
 */
export function classifyRegime(
  candles: OHLCV[],
  structure: StructureResultData,
  configOverrides?: DeepPartial<EngineConfig>,
  marketAsOf?: number
): EngineResult<RegimeResultData> {
  const config = resolveConfig(configOverrides);
  const ind = config.indicators;
  const reg = config.regime;
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];

  const px = candles.map((c) => c.close);
  const emaShort = last(ema(px, ind.emaShort)) ?? 0;
  const emaMid = last(ema(px, ind.emaMid)) ?? 0;
  const emaLong = last(ema(px, ind.emaLong)) ?? 0;
  const adxResult = adx(candles, ind.adxPeriod);
  const adxValue = last(adxResult.adx) ?? 0;
  const plusDI = last(adxResult.plusDI) ?? 0;
  const minusDI = last(adxResult.minusDI) ?? 0;
  const atrValue = last(atr(candles, ind.atrPeriod)) ?? 0;
  const lastClose = last(px) ?? 0;
  const atrPct = lastClose > 0 ? (atrValue / lastClose) * 100 : 0;

  const bandWidth = bollingerBandWidth(
    px,
    ind.bollingerPeriod,
    ind.bollingerMultiplier
  );
  const bandWidthNow = last(bandWidth) ?? 0;
  const lookback = Math.min(reg.regimeLookback, Math.max(1, bandWidth.length));
  const bandWidthBaseline = mean(bandWidth.slice(-lookback)) || bandWidthNow;
  const bandWidthRatio =
    bandWidthBaseline > 0 ? bandWidthNow / bandWidthBaseline : 1;

  // --- Factor 1: EMA stack alignment. ---
  const stackSignal =
    (emaShort > emaMid ? 1 : -1) + (emaMid > emaLong ? 1 : -1);
  evidence.push({
    code: "EMA_ALIGNMENT",
    label: "EMA stack alignment",
    description: `EMA${ind.emaShort}=${emaShort.toFixed(5)}, EMA${ind.emaMid}=${emaMid.toFixed(5)}, EMA${ind.emaLong}=${emaLong.toFixed(5)}. Stack signal: ${stackSignal > 0 ? "bullish" : stackSignal < 0 ? "bearish" : "mixed"}.`,
    value: stackSignal,
  });

  // --- Factor 2: Market structure agreement. ---
  const structureSignal: number =
    structure.trend === "LONG" ? 1 : structure.trend === "SHORT" ? -1 : 0;
  evidence.push({
    code: "STRUCTURE_TREND",
    label: "Market structure trend",
    description: `Structure engine reports ${structure.trend} with strength ${structure.trendStrength.toFixed(0)}.`,
    value: structure.trend,
  });

  const combined = stackSignal + structureSignal;
  const trendDirection: Direction =
    combined >= 2 ? "LONG" : combined <= -2 ? "SHORT" : "NEUTRAL";

  if (stackSignal > 0 && structureSignal < 0) {
    conflicts.push({
      code: "STRUCTURE_VS_EMA",
      label: "Structure disagrees with EMA stack",
      description: "EMAs are stacked bullish but market structure is bearish.",
    });
  } else if (stackSignal < 0 && structureSignal > 0) {
    conflicts.push({
      code: "STRUCTURE_VS_EMA",
      label: "Structure disagrees with EMA stack",
      description: "EMAs are stacked bearish but market structure is bullish.",
    });
  }

  // --- Factor 3: ADX trend strength. ---
  const isStrongTrend = adxValue >= reg.adxStrongTrend;
  const isTrending = adxValue >= reg.adxTrendThreshold;
  evidence.push({
    code: "ADX",
    label: "ADX trend strength",
    description: `ADX=${adxValue.toFixed(1)} (+DI ${plusDI.toFixed(1)} / -DI ${minusDI.toFixed(1)}). ${isStrongTrend ? "Strong" : isTrending ? "Moderate" : "Weak"} trend.`,
    value: adxValue,
  });

  // --- Factor 4: ATR volatility. ---
  const isHighVolatility = atrPct >= reg.highVolatilityAtrPct;
  const isLowVolatility = atrPct <= reg.lowVolatilityAtrPct;
  evidence.push({
    code: "ATR_VOLATILITY",
    label: "ATR volatility",
    description: `ATR=${atrValue.toFixed(5)} = ${atrPct.toFixed(2)}% of price. ${isHighVolatility ? "Elevated" : isLowVolatility ? "Suppressed" : "Normal"} volatility.`,
    value: atrPct,
  });

  // --- Factor 5: Bollinger Band Width expansion. ---
  const isExpansion = bandWidthRatio >= reg.breakoutBandWidthRatio;
  evidence.push({
    code: "BAND_WIDTH",
    label: "Bollinger Band Width",
    description: `Band width ${bandWidthNow.toFixed(5)} vs ${lookback}-bar average ${bandWidthBaseline.toFixed(5)} (ratio ${bandWidthRatio.toFixed(2)}). ${isExpansion ? "Expanding" : "Compressed"}.`,
    value: bandWidthRatio,
  });

  // --- Classification. Volatility never silently overrides a real trend. ---
  let regime: RegimeLabel;
  if (isExpansion && isTrending && trendDirection !== "NEUTRAL") {
    regime = "BREAKOUT";
  } else if (trendDirection !== "NEUTRAL" && isStrongTrend) {
    regime = trendDirection === "LONG" ? "STRONG_TREND_UP" : "STRONG_TREND_DOWN";
  } else if (trendDirection !== "NEUTRAL" && isTrending) {
    regime = trendDirection === "LONG" ? "TREND_UP" : "TREND_DOWN";
  } else if (isHighVolatility) {
    regime = "HIGH_VOLATILITY";
  } else if (isLowVolatility) {
    regime = "LOW_VOLATILITY";
  } else {
    regime = "RANGE";
  }

  if (trendDirection !== "NEUTRAL" && isHighVolatility) {
    conflicts.push({
      code: "HIGH_VOLATILITY_WITH_TREND",
      label: "Elevated volatility inside a trend",
      description: `Trend is ${trendDirection} but ATR is ${atrPct.toFixed(2)}% of price; wider stops and slippage risk apply.`,
    });
  }

  const strength = Math.round(
    Math.max(0, Math.min(100, adxValue * (trendDirection === "NEUTRAL" ? 0.5 : 1)))
  );

  const data: RegimeResultData = {
    regime,
    baseRegime: regimeToBase(regime),
    direction: regime === "BREAKOUT" ? trendDirection : regimeDirection(regime),
    strength,
    adx: adxValue,
    ema20: emaShort,
    ema50: emaMid,
    ema200: emaLong,
    atr: atrValue,
    bandWidthRatio,
  };

  return {
    status: `REGIME_${regime}`,
    score: strength,
    confidence: Math.min(100, Math.round((adxValue / reg.adxStrongTrend) * 100)),
    evidence,
    conflicts,
    data,
    timestamp: engineTimestamp(marketAsOf),
  };
}
