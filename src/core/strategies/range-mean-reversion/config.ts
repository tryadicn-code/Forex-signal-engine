export interface RangeMeanReversionConfig {
  /** H1 bars whose confirmed swings may define the current range. */
  lookbackBars: number;
  /** Minimum confirmed swing touches required at each boundary. */
  minTouchesPerBoundary: number;
  /** Fixed clustering tolerance for repeated boundary touches. */
  boundaryTolerancePips: number;
  /** ATR-derived clustering tolerance for repeated boundary touches. */
  boundaryToleranceAtr: number;
  /** Minimum width required before a range is tradeable. */
  minRangeWidthPips: number;
  /** Maximum range width relative to H1 ATR before classification is rejected. */
  maxRangeWidthAtr: number;
  /** Fixed half-width of the tradeable boundary zone. */
  entryZonePips: number;
  /** ATR-derived half-width of the tradeable boundary zone. */
  entryZoneAtr: number;
  /** Maximum distance from a boundary to begin evaluating mean reversion. */
  boundaryProximityPips: number;
  /** Invalidation buffer outside the validated range boundary. */
  invalidationBufferPips: number;
  /** Minimum setup quality for a boundary to become actionable. */
  minSetupScore: number;
  /** Recent M15 bars searched for a boundary rejection. */
  maxRejectionAgeBars: number;
  /** Maximum age of post-rejection structural confirmation. */
  maxConfirmationAgeBars: number;
  /** Wick/body ratio accepted as a boundary rejection candle. */
  rejectionWickRatio: number;
  /** Body/range ratio accepted as a decisive close back into the range. */
  minRejectionBodyRatio: number;
  /** Composite trigger score required for confirmation. */
  minTriggerScore: number;
}

export const DEFAULT_RANGE_MEAN_REVERSION_CONFIG: Readonly<RangeMeanReversionConfig> = {
  lookbackBars: 80,
  minTouchesPerBoundary: 2,
  boundaryTolerancePips: 12,
  boundaryToleranceAtr: 0.15,
  minRangeWidthPips: 40,
  maxRangeWidthAtr: 12,
  entryZonePips: 10,
  entryZoneAtr: 0.12,
  boundaryProximityPips: 20,
  invalidationBufferPips: 8,
  minSetupScore: 60,
  maxRejectionAgeBars: 4,
  maxConfirmationAgeBars: 4,
  rejectionWickRatio: 1.5,
  minRejectionBodyRatio: 0.35,
  minTriggerScore: 90,
};
