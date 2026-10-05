/**
 * Scanner result contract (Section 17 spec).
 *
 * The structured, presentation-free object Phase 3 will consume. It carries the
 * Phase 1 conclusions, the data-quality context and the lifecycle state - but no
 * formatting, no strings-as-data and no trading decisions of its own.
 */

import type {
  BiasLabel,
  Direction,
  ExecutionDecision,
  RegimeLabel,
  SetupState,
  SignalState,
  Timeframe,
  TriggerState,
} from "@/types/market";
import type {
  FreshnessStatus,
  ValidationIssue,
} from "@/types/market-data";
import type { ConditionCheck, Evidence, Conflict } from "@/types/engine";
import type { StrategyId } from "@/core/strategies/types";
import type { StrategyRoutingDecision } from "@/core/strategies/router";

/**
 * One timeframe's contribution to the multi-timeframe view.
 *
 * Presentation-only summary of the scanner's TimeframeContext: the phase the UI
 * needs (which role, how fresh, how much data) with none of the candle arrays.
 * The scanner stays the only place structure is computed.
 */
export interface TimeframeSummary {
  role: "macro" | "bias" | "setup" | "trigger";
  timeframe: Timeframe;
  /** UTC epoch ms of the newest closed candle on this timeframe. */
  asOf: number | null;
  freshness: FreshnessStatus;
  /** Closed, validated candles available on this timeframe. */
  closedCandles: number;
}

/**
 * The structured execution detail behind SymbolScanResult.executionDecision.
 *
 * Surfaces the execution engine's own condition checks, vetoes and reasons so
 * the UI can explain a BLOCK without re-deriving it. Never computed in the UI.
 */
export interface ExecutionDetail {
  decision: ExecutionDecision;
  conditions: ConditionCheck[];
  triggeredVetoes: string[];
  reasons: string[];
}

/**
 * The risk engine detail behind SymbolScanResult.riskReward, for the signal
 * detail panel. Levels are the engine's own output.
 */
export interface RiskDetail {
  approved: boolean;
  rejectionReason: string | null;
  /** Frozen entry candidate used by the existing Risk Engine. */
  entryPrice?: number | null;
  /** Setup invalidation level used as the hard stop. */
  stopLoss?: number | null;
  stopDistancePips: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  /** Risk Engine capital-at-risk snapshot in account currency. */
  riskCapital?: number | null;
  riskPercent?: number | null;
  positionSize?: number | null;
  plannedRR?: number | null;
  pipSize?: number | null;
  accountCurrency?: string | null;
}

/**
 * UIUX-M-001: planned entry/stop/TP derived from the Setup Engine's own zone.
 * Present only while the setup is actionable (SETUP or ARMED) and the
 * direction is not NEUTRAL. This is NOT the frozen execution snapshot; the
 * Risk Engine still owns the final entry/SL/TP once the trigger confirms.
 * Presentation-only; never fed back into the engine.
 */
export interface PlannedLevels {
  direction: "LONG" | "SHORT";
  /** Midpoint of the current setup zone (reference, not a fill guarantee). */
  entry: number;
  /** Setup invalidation level (later reused by the Risk Engine as the stop). */
  stop: number;
  /** Level projected at the strategy's minimum reward-to-risk. */
  takeProfit: number;
  /** Reward-to-risk used to project takeProfit. */
  rr: number;
  zoneLow: number;
  zoneHigh: number;
  /** Which engine produced the zone, kept for display context. */
  source: string;
}

export interface SymbolScanResult {
  symbol: string;

  /** Outcome of the whole per-symbol pipeline. */
  status: SymbolScanStatus;
  /** Human/machine-readable reason for the status. */
  reason: string;

  latestPrice: number | null;
  spreadPips: number | null;

  regime: RegimeLabel | null;
  /**
   * Actual audited strategy used to produce this result.
   * Optional for persisted/pre-Phase-12.3 snapshots and legacy test fixtures.
   */
  strategyId?: StrategyId | null;
  /**
   * Regime router decision, including preferred vs compatibility fallback.
   * Optional for persisted/pre-Phase-12.3 snapshots and legacy test fixtures.
   */
  strategyRouting?: StrategyRoutingDecision | null;
  bias: BiasLabel | null;
  biasScore: number | null;
  biasDirection: Direction | null;

  setupState: SetupState | null;
  setupScore: number | null;

  triggerState: TriggerState | null;
  triggerScore: number | null;
  /** Age of the trigger event in closed trigger candles. */
  triggerAgeInBars: number | null;

  riskReward: number | null;
  positionSize: number | null;

  executionDecision: ExecutionDecision | null;

  signalState: SignalState | null;
  signalId: string | null;

  freshness: FreshnessStatus | null;
  updatedAt: number | null;

  /** D1/H4/H1/M15 summary for the multi-timeframe view. */
  timeframes: TimeframeSummary[];
  /** Structured execution detail (conditions, vetoes, reasons). */
  executionDetail: ExecutionDetail | null;
  /** Risk-engine levels behind the R:R figure. */
  riskDetail: RiskDetail | null;
  /**
   * UIUX-M-001: planned levels from the current setup zone, rendered before
   * the trigger confirms so the user can see where the engine is waiting.
   * Null when no actionable setup exists yet.
   */
  plannedLevels?: PlannedLevels | null;

  /** Phase 1 evidence backing the conclusions. */
  evidence: Evidence[];
  conflicts: Conflict[];
  /** Data-quality and provider issues, surfaced rather than hidden. */
  issues: ValidationIssue[];
  errors: string[];
    /** B2-M4: trigger bar age; lower is fresher. Used to prioritise live candidates. */
  triggerAgeBars?: number;
}

export type SymbolScanStatus =
  /** Analysed successfully; a result exists. */
  | "ANALYSED"
  /** The provider could not supply usable data for this symbol. */
  | "PROVIDER_FAILURE"
  /** Data existed but was too malformed to analyse. */
  | "INVALID_DATA"
  /** An unexpected exception escaped a stage (never crashes the cycle). */
  | "ANALYSIS_ERROR";

/**
 * A structured failure result, so one pair's problem is explicit, not silent.
 *
 * `asOf` is the analysis time the failure is recorded at. Callers pass the
 * scanner's market time so the result is reproducible under replay; the
 * wall clock is only used when the caller genuinely has no analysis time
 * (a failure recorded before any market data was ever seen).
 */
export function failureResult(
  symbol: string,
  status: SymbolScanStatus,
  reason: string,
  asOf: number,
  errors: string[] = []
): SymbolScanResult {
  return {
    symbol,
    status,
    reason,
    latestPrice: null,
    spreadPips: null,
    regime: null,
    strategyId: null,
    strategyRouting: null,
    bias: null,
    biasScore: null,
    biasDirection: null,
    setupState: null,
    setupScore: null,
    triggerState: null,
    triggerScore: null,
    triggerAgeInBars: null,
    riskReward: null,
    positionSize: null,
    executionDecision: null,
    signalState: null,
    signalId: null,
    freshness: null,
    updatedAt: asOf,
    timeframes: [],
    executionDetail: null,
    riskDetail: null,
    plannedLevels: null,
    evidence: [],
    conflicts: [],
    issues: [],
    errors,
  };
}

export interface ScannerSnapshot {
  /** UTC epoch ms the scan started. */
  startedAt: number;
  /** UTC epoch ms the scan completed. */
  completedAt: number | null;
  durationMs: number | null;
  symbolsRequested: number;
  symbolsSuccessful: number;
  symbolsFailed: number;
  results: SymbolScanResult[];
  providerStatus: import("@/types/market-data").ProviderStatus | null;
  freshnessSummary: Record<FreshnessStatus, number>;
}

export interface ScannerHealth {
  lastScanStartedAt: number | null;
  lastScanCompletedAt: number | null;
  durationMs: number | null;
  symbolsRequested: number;
  symbolsSuccessful: number;
  symbolsFailed: number;
  providerStatus: import("@/types/market-data").ProviderStatus | null;
  freshnessSummary: Record<FreshnessStatus, number>;
  activeSignals: number;
}