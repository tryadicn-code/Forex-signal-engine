import type {
  AnalysisContext,
  PipelineResult,
} from "@/core/orchestrator/types";

export type StrategyId =
  | "TREND_PULLBACK"
  | "BREAKOUT_RETEST"
  | "RANGE_MEAN_REVERSION"
  | "REVERSAL";

/** Strategies with audited implementations available in this phase. */
export type ImplementedStrategyId =
  | "TREND_PULLBACK"
  | "BREAKOUT_RETEST";

export interface StrategyDefinition {
  id: StrategyId;
  analyze(context: AnalysisContext): PipelineResult;
}
