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
  TriggerState,
} from "@/types/market";
import type {
  FreshnessStatus,
  ValidationIssue,
} from "@/types/market-data";
import type { Evidence, Conflict } from "@/types/engine";

export interface SymbolScanResult {
  symbol: string;

  /** Outcome of the whole per-symbol pipeline. */
  status: SymbolScanStatus;
  /** Human/machine-readable reason for the status. */
  reason: string;

  latestPrice: number | null;
  spreadPips: number | null;

  regime: RegimeLabel | null;
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

  /** Phase 1 evidence backing the conclusions. */
  evidence: Evidence[];
  conflicts: Conflict[];
  /** Data-quality and provider issues, surfaced rather than hidden. */
  issues: ValidationIssue[];
  errors: string[];
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