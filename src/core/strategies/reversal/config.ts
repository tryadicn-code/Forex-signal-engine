export interface ReversalConfig {
  /** Fresh H4 CHOCH age allowed for reversal qualification. */
  maxTransitionAgeBars: number;
  /** Bars before CHOCH searched for an exhaustion/liquidity sweep. */
  maxExhaustionLookbackBars: number;
  /** Fixed minimum distance beyond the swept swing. */
  minSweepPips: number;
  /** ATR-derived minimum distance beyond the swept swing. */
  minSweepAtr: number;
  /** Fixed half-width around the H4 CHOCH transition level. */
  transitionZonePips: number;
  /** ATR-derived half-width around the transition level. */
  transitionZoneAtr: number;
  /** Distance from the transition zone at which setup becomes active. */
  transitionProximityPips: number;
  /** Do not chase price farther than this from the transition level. */
  maxChaseDistancePips: number;
  /** Stop buffer beyond the exhaustion extreme. */
  invalidationBufferPips: number;
  /** Minimum reversal setup quality. */
  minSetupScore: number;
  /** M15 bars searched for a transition-level retest/rejection. */
  maxRetestAgeBars: number;
  /** M15 bars allowed between retest and structural turn. */
  maxConfirmationAgeBars: number;
  /** Wick/body ratio accepted as reversal rejection quality. */
  rejectionWickRatio: number;
  /** Directional body/range ratio accepted as reversal quality. */
  minRejectionBodyRatio: number;
  /** Composite trigger score required for reversal confirmation. */
  minTriggerScore: number;
}

export const DEFAULT_REVERSAL_CONFIG: Readonly<ReversalConfig> = {
  maxTransitionAgeBars: 6,
  maxExhaustionLookbackBars: 12,
  minSweepPips: 5,
  minSweepAtr: 0.08,
  transitionZonePips: 10,
  transitionZoneAtr: 0.12,
  transitionProximityPips: 25,
  maxChaseDistancePips: 70,
  invalidationBufferPips: 10,
  minSetupScore: 65,
  maxRetestAgeBars: 4,
  maxConfirmationAgeBars: 4,
  rejectionWickRatio: 1.5,
  minRejectionBodyRatio: 0.4,
  minTriggerScore: 90,
};
