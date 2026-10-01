/**
 * Standard engine result contract (Section 3 spec).
 *
 * Every engine returns this shape so the pipeline is uniform, explainable, and
 * directly renderable by the dashboard later. Reasoning is never a free-form
 * string blob - it is structured {@link Evidence} the UI can list and weight.
 */

import type {
  BiasLabel,
  Direction,
  MarketRegime,
  RegimeLabel,
  SetupState,
  TriggerState,
} from "./market";

/**
 * One atomic, human-readable reason an engine considered.
 *
 * Keep codes stable and UPPER_SNAKE: the dashboard will group by them.
 */
export interface Evidence {
  code: string;
  label: string;
  description: string;
  /** Contribution weight used by scoring engines (0-100 scale). */
  weight?: number;
  /** The measured value behind this piece of evidence. */
  value?: number | string | boolean;
}

/**
 * Evidence that argues *against* the engine's own conclusion.
 *
 * Engines must surface their own contradictions. The dashboard renders these
 * separately so a trader always sees the counter-case, never just the bull case.
 */
export type Conflict = Evidence;

/**
 * The uniform envelope returned by every engine.
 *
 * @typeParam T - the engine-specific payload, e.g. `BiasResultData`.
 */
export interface EngineResult<T> {
  /** Machine-readable status for this stage, e.g. "BIAS_LONG". */
  status: string;
  /** Stage score on a 0-100 scale (meaning is stage-defined). */
  score: number;
  /** Optional 0-100 confidence, distinct from raw score. */
  confidence?: number;
  /** Reasons supporting the conclusion. */
  evidence: Evidence[];
  /** Reasons arguing against the conclusion. */
  conflicts: Conflict[];
  /** The stage payload. */
  data: T;
  /** ISO-8601 timestamp of when the stage ran. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Pipeline stage payloads
// ---------------------------------------------------------------------------

export interface SwingPoint {
  /** Index of the pivot bar. The pivot is NOT observable on its own bar. */
  index: number;
  timestamp: number;
  price: number;
  kind: "high" | "low";
  /** Index of the bar at which the pivot became observable (index + lookback). */
  confirmedAtIndex: number;
  /** Timestamp of the confirmation bar. */
  confirmedAtTimestamp: number;
}

export type StructureTrendEvent =
  | "HH"
  | "HL"
  | "LH"
  | "LL"
  | "BOS"
  | "CHOCH";

export interface StructurePoint {
  type: StructureTrendEvent;
  /** Index of the bar the event is anchored to (pivot, or break candle). */
  index: number;
  timestamp: number;
  price: number;
  /** Direction this structure point implies. */
  direction: Direction;
  /** True when the point was confirmed by a close beyond the level. */
  confirmed: boolean;
  /**
   * Index of the bar at which this point became observable. No engine may use
   * this point when deciding an earlier bar.
   */
  confirmedAtIndex: number;
  confirmedAtTimestamp: number;
}

/** Market Structure Engine payload (Section 5 spec). */
export interface StructureResultData {
  trend: Direction;
  /** Every detected swing high (for zone-building engines). */
  swingHighs: SwingPoint[];
  /** Every detected swing low (for zone-building engines). */
  swingLows: SwingPoint[];
  lastSwingHigh: SwingPoint | null;
  lastSwingLow: SwingPoint | null;
  lastBOS: StructurePoint | null;
  lastCHOCH: StructurePoint | null;
  structurePoints: StructurePoint[];
  /**
   * Chronological record of every confirmed structural break. A break is a
   * historical fact: it is never removed again, even if price later retraces
   * back inside the broken level.
   */
  breakEvents: StructurePoint[];
  /** Count of consecutive higher-highs / higher-lows used for trend strength. */
  trendStrength: number;
  /** Pairs of swing highs within the configured tolerance (Section 5 spec). */
  equalHighs: SwingPoint[][];
  /** Pairs of swing lows within the configured tolerance (Section 5 spec). */
  equalLows: SwingPoint[][];
}

/** Market Regime Engine payload (Section 6 spec). */
export interface RegimeResultData {
  regime: RegimeLabel;
  /** Base domain regime, derived from the label. */
  baseRegime: MarketRegime;
  direction: Direction;
  /** 0-100 strength of the classification. */
  strength: number;
  adx: number;
  ema20: number;
  ema50: number;
  ema200: number;
  atr: number;
  /** Bollinger Band Width relative to its own lookback average. */
  bandWidthRatio: number;
}

/**
 * Fundamental data placeholder (Section 7 spec).
 *
 * The Bias Engine accepts an optional fundamentals feed, but Phase 1 ships no
 * provider. Any object satisfying this interface can be supplied later without
 * touching engine code.
 */
export interface FundamentalContext {
  pair: string;
  /** Net positioning or sentiment score, -100..+100 when known. */
  sentiment?: number;
  /** Whether high-impact news is due soon. */
  newsPending?: boolean;
  /** Free-form, provider-specific notes. */
  notes?: string[];
}

/** Bias Engine payload (Section 7 spec). */
export interface BiasResultData {
  label: BiasLabel;
  direction: Direction;
  /** Signed conviction, -100 (max short) .. +100 (max long). */
  score: number;
  /** Weighted component contributions, summing to `score`. */
  components: Record<BiasComponent, number>;
  /** Weight actually applied per component (post-config-override). */
  weights: Record<BiasComponent, number>;
}

export type BiasComponent =
  | "structure"
  | "trend"
  | "regime"
  | "momentum";

/** Setup Engine payload (Section 8 spec). */
export interface SetupResultData {
  state: SetupState;
  zoneLow: number;
  zoneHigh: number;
  /** Distance from current price to the near edge of the zone, in pips. */
  distanceToZone: number;
  setupType: string;
  setupScore: number;
  invalidationLevel: number;
  /** Which support/resistance family this zone came from. */
  zoneSource: string;
}

/** State of one component of the composite trigger model. */
export interface TriggerComponentState {
  name: string | null;
  fired: boolean;
  index: number | null;
  timestamp: number | null;
}

/** Per-component evidence behind a trigger decision (Section 9 spec). */
export interface TriggerBreakdown {
  /** Structural confirmation: BOS / CHOCH / reclaim in the trade direction. */
  structural: TriggerComponentState;
  /** Location validation: price inside, or retesting, the setup zone. */
  location: TriggerComponentState;
  /** Optional candle confirmation: engulfing or rejection wick. */
  candle: TriggerComponentState;
  /** Momentum readings backing the optional momentum component. */
  momentum: { rsi: number; macdHistogram: number; aligned: boolean };
  /** Relative/tick-volume expansion backing the optional volume component. */
  volume?: {
    current: number;
    baseline: number;
    ratio: number;
    confirmed: boolean;
  };
  /** Composite trigger score on the 0-100 scale. */
  score: number;
}

/** Trigger Engine payload (Section 9 spec). */
export interface TriggerResultData {
  state: TriggerState;
  /** Composite label for the combination that fired, e.g. "BOS+IN_ZONE". */
  triggerType: string | null;
  /** Candle index the trigger fired on, if any. */
  triggerIndex: number | null;
  /** Timestamp (epoch ms) of the candle the trigger fired on. */
  triggerTimestamp: number | null;
  /** Bars between the trigger event and the latest closed candle. */
  ageInBars: number | null;
  /** Structured per-component evidence, not just the first matching trigger. */
  breakdown: TriggerBreakdown;
}

/** Risk Engine payload (Section 10 spec). */
export interface RiskResultData {
  riskCapital: number;
  /** Absolute distance entry->stop, in price units. */
  stopDistance: number;
  /** Stop distance expressed in pips. */
  stopDistancePips: number;
  positionSize: number;
  /** Reward-to-risk ratio achieved (target / risk). */
  rr: number;
  tp1: number;
  tp2: number;
  approved: boolean;
  rejectionReason: string | null;
}

/** Execution Engine payload (Section 11 spec). */
export interface ExecutionResultData {
  decision: import("./market").ExecutionDecision;
  /** Every mandatory condition evaluated and whether it passed. */
  conditions: ConditionCheck[];
  /** Hard vetoes that fired, if any. */
  triggeredVetoes: string[];
  /** Human-readable rationale, one entry per contributing gate. */
  reasons: string[];
}

export interface ConditionCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/** Ordered pipeline stages. Execution remains last by design. */
export const PIPELINE_STAGES = [
  "market-data",
  "structure",
  "regime",
  "bias",
  "setup",
  "trigger",
  "risk",
  "execution",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];
