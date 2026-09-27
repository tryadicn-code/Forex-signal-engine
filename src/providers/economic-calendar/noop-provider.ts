/**
 * NoopEconomicCalendarProvider.
 *
 * Phase 2 defines the economic-calendar CONTRACT only. A production news API is
 * deliberately out of scope (Section 25 / 42 spec), so this provider exists to
 * make the absence EXPLICIT rather than to fake an answer.
 *
 * It reports {@link NewsEvaluationStatus.SKIPPED} and omits `newsPending`. That
 * is not the same as "checked and confirmed no news": because `newsPending` is
 * absent, the Phase 1 NEWS_BLOCK veto evaluates as SKIPPED (no provider
 * connected) instead of being falsely satisfied, so execution is never greenlit
 * on the strength of a check that never happened. When a real provider exists
 * it can be swapped in by implementing {@link EconomicCalendarProvider} and
 * selecting it in configuration; nothing in the scanner changes.
 */

import type {
  EconomicCalendarProvider,
  NewsRiskContext,
  ProviderResult,
  ProviderStatus,
} from "@/types/market-data";

export class NoopEconomicCalendarProvider implements EconomicCalendarProvider {
  readonly id = "noop";

  async getNewsRisk(): Promise<ProviderResult<NewsRiskContext>> {
    return {
      ok: true,
      data: {
        evaluationStatus: "SKIPPED",
        // Deliberately no newsPending: an unchecked window must not read as clear.
      },
    };
  }

  getProviderStatus(): ProviderStatus {
    return {
      state: "CONNECTED",
      lastSuccessAt: null,
      lastFailureAt: null,
      errorCount: 0,
    };
  }
}
