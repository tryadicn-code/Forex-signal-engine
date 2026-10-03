import type { HistoricalBacktestAnalytics } from "@/replay/analytics-types";
import type { HistoricalExecutionConfig, HistoricalExecutionSummary } from "@/replay/execution-types";
import type { ScannerSnapshot } from "@/scanner/scanner-result";
import type { Timeframe } from "@/types/market";
import type { CanonicalCandle, SymbolMetadata } from "@/types/market-data";

/**
 * Immutable historical input for one symbol.
 *
 * Phase 5.1 deliberately requires already-normalized canonical candles. CSV,
 * MT5 history downloads and vendor-specific parsers belong outside the replay
 * engine so the engine itself remains provider-agnostic and deterministic.
 */
export interface ReplaySymbolData {
  metadata: SymbolMetadata;
  /**
   * Historical spread assumption in pips for Phase 5.1.
   *
   * This is intentionally explicit and static. Variable historical spread/cost
   * modelling is a later validation concern; the replay foundation must never
   * invent a random spread.
   */
  spreadPips: number;
  candles: Partial<Record<Timeframe, CanonicalCandle[]>>;
}

export interface ReplayDataset {
  /** Stable user/data-source supplied id for reproducibility. */
  id: string;
  /** Optional human-readable provenance, e.g. "MT5 export 2024-2026". */
  source?: string;
  symbols: Record<string, ReplaySymbolData>;
  /**
   * Optional deterministic FX conversion table used by the existing Risk Engine
   * when quote currency differs from account currency.
   */
  conversionRates?: Record<string, number>;
}

export interface ReplayRunConfig {
  startAt: number;
  endAt: number;
  /** Replay advances on closed bars of this timeframe. Default M15. */
  stepTimeframe?: Timeframe;
  /** Optional subset of dataset symbols. Defaults to every dataset symbol. */
  symbols?: string[];
  /** Scanner candle window. Defaults to the existing scanner configuration. */
  candleLookback?: number;
  /** Existing Risk Engine account input. No paper account is created. */
  accountBalance?: number;
  accountCurrency?: string;
  riskPercent?: number;
  /** Optional Phase 5.2 historical order/position simulation. Disabled by default. */
  execution?: HistoricalExecutionConfig;
}

export interface ReplayStep {
  index: number;
  asOf: number;
  snapshot: ScannerSnapshot;
}

export interface ReplayRunResult {
  datasetId: string;
  source?: string;
  startAt: number;
  endAt: number;
  stepTimeframe: Timeframe;
  stepCount: number;
  firstStepAt: number | null;
  lastStepAt: number | null;
  steps: ReplayStep[];
  /** Historical execution result when Phase 5.2 execution is enabled. */
  execution: HistoricalExecutionSummary | null;
  /** Phase 5.3 analytics derived only from historical execution state. */
  analytics: HistoricalBacktestAnalytics | null;
}

export type ReplayStepHandler = (step: ReplayStep) => void | Promise<void>;
