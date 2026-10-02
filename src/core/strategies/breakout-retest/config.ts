export interface BreakoutRetestConfig {
  /** Maximum age of the H1 breakout event before it is no longer actionable. */
  maxBreakoutAgeBars: number;
  /** Minimum close beyond the broken level, expressed in ATR multiples. */
  minBreakoutCloseAtr: number;
  /** Fixed minimum half-width of the retest zone. */
  zoneBufferPips: number;
  /** ATR-derived half-width of the retest zone. */
  zoneBufferAtr: number;
  /** Distance from the retest zone at which the setup becomes active. */
  retestProximityPips: number;
  /** Distance beyond which price is considered extended and must not be chased. */
  maxChaseDistancePips: number;
  /** Stop/invalidation buffer beyond the far side of the broken level zone. */
  invalidationBufferPips: number;
  /** Recent trigger bars searched for a valid retest-hold. */
  maxRetestAgeBars: number;
  /** Recent trigger bars allowed between retest and structural resumption. */
  maxConfirmationAgeBars: number;
  /** Minimum strategy-specific setup quality. */
  minSetupScore: number;
  /** Composite breakout trigger score required for confirmation. */
  minTriggerScore: number;
  /** Minimum body/range ratio that counts as a strong retest rejection candle. */
  minRetestBodyRatio: number;
}

export const DEFAULT_BREAKOUT_RETEST_CONFIG: Readonly<BreakoutRetestConfig> = {
  maxBreakoutAgeBars: 12,
  minBreakoutCloseAtr: 0.12,
  zoneBufferPips: 8,
  zoneBufferAtr: 0.12,
  retestProximityPips: 20,
  maxChaseDistancePips: 60,
  invalidationBufferPips: 8,
  maxRetestAgeBars: 4,
  maxConfirmationAgeBars: 4,
  minSetupScore: 55,
  minTriggerScore: 90,
  minRetestBodyRatio: 0.55,
};
