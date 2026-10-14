/**
 * PRICE_ACTION strategy configuration (TRD-RR-006).
 *
 * Hanya komponen EMA, Support/Resistance, Supply/Demand, dan Price Action.
 * Tidak ada RSI/MACD/ADX/volume sebagai syarat entry.
 */
export interface PriceActionConfig {
  /** EMA periods used as trend context (H4). */
  emaShort: number;
  emaMid: number;
  emaLong: number;

  /** Rejection wick must be at least this multiple of the candle body. */
  rejectionWickRatio: number;
  /** Engulfing candle body must be at least this ratio of the previous range. */
  engulfMinBodyRatio: number;
  /** Maximum age (in trigger bars) of a structural confirmation. */
  maxTriggerAgeBars: number;

  /** Buffer in pips applied when building S/R and S/D zones. */
  zoneBufferPips: number;

  /** Minimum room to the opposing obstacle before an entry is allowed, in R. */
  minRoomToObstacleR: number;

  /**
   * When true, a trend-pullback candidate requires EMA stack alignment
   * (EMA20/50/200 ordered in the trade direction). Set false for an A/B
   * comparison of the EMA filter.
   */
  requireEmaAlignment: boolean;

  /** Enable the TREND_PULLBACK family. */
  enableTrendPullback: boolean;
  /** Enable the BREAKOUT_RETEST family. */
  enableBreakoutRetest: boolean;
  /** Enable the REVERSAL family (countertrend, stricter). */
  enableReversal: boolean;
}

export const DEFAULT_PRICE_ACTION_CONFIG: Readonly<PriceActionConfig> = {
  emaShort: 20,
  emaMid: 50,
  emaLong: 200,
  rejectionWickRatio: 2.0,
  engulfMinBodyRatio: 0.7,
  maxTriggerAgeBars: 3,
  zoneBufferPips: 5,
  minRoomToObstacleR: 1.0,
  requireEmaAlignment: true,
  enableTrendPullback: true,
  enableBreakoutRetest: true,
  enableReversal: true,
};