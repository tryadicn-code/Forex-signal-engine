import type { ExecutionMode } from "@/types/market";

/**
 * B2-H4: Live execution cannot tolerate signal drift against the broker's
 * frozen-entry deviation check (MT5_TRADE_MAX_DEVIATION_POINTS, default
 * 20 points, roughly 2 pips on EURUSD).
 *
 * When the mode is LIVE, cap trigger confirmation age to this many bars so
 * the entry reference (close of the trigger bar) stays close to current
 * market price and passes the broker's drift gate.
 *
 * Tuning guide:
 *  - 0 = strictest: only the most recently closed bar may confirm.
 *  - 1 = default: admits a trigger one bar old (full M15 cycle headroom).
 *  - Increase only if MT5_TRADE_MAX_DEVIATION_POINTS is raised accordingly.
 *
 * Non-live modes (SIGNAL_ONLY, PAPER) keep the strategy's own configured
 * value, because no broker-side drift check applies there.
 */
export const LIVE_MAX_CONFIRMATION_AGE_BARS = 1;

/**
 * Return a partial strategy-config override that caps maxConfirmationAgeBars
 * in LIVE mode, or an empty object otherwise. Designed to be spread into the
 * `strategyConfig` argument of a trigger evaluator.
 */
export function modeAwareConfirmationAgeOverride(
  mode: ExecutionMode | undefined
): { maxConfirmationAgeBars?: number } {
  if (mode === "LIVE") {
    return { maxConfirmationAgeBars: LIVE_MAX_CONFIRMATION_AGE_BARS };
  }
  return {};
}