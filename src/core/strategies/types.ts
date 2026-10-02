import type {
  AnalysisContext,
  PipelineResult,
} from "@/core/orchestrator/types";

export type StrategyId = "TREND_PULLBACK";

export interface StrategyDefinition {
  id: StrategyId;
  analyze(context: AnalysisContext): PipelineResult;
}
