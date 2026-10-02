import type {
  AnalysisContext,
  PipelineResult,
} from "@/core/orchestrator/types";
import { analyzeTrendPullback } from "@/core/strategies/trend-pullback";

/**
 * Compatibility orchestrator entrypoint.
 *
 * Phase 12.2 names the existing strategy TREND_PULLBACK but deliberately keeps
 * the public analyzeMarket() contract unchanged. Market-regime routing is NOT
 * introduced here; that belongs to the next phase.
 */
export function analyzeMarket(context: AnalysisContext): PipelineResult {
  return analyzeTrendPullback(context);
}

export type {
  AnalysisContext,
  PipelineResult,
  TimeframeInput,
} from "@/core/orchestrator/types";
