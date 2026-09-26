/**
 * Pure execution-decision function.
 *
 * This is the ONLY trading logic implemented in Phase 1, and it is deliberately
 * side-effect free: it maps a risk assessment + setup state to one of the four
 * allowed decisions and explains itself. It never touches a broker.
 */

import type { ExecutionDecision } from "@/types/market";

export interface DecisionInput {
  /** True when the Setup Engine validated a pattern. */
  setupValid: boolean;
  /** True when the Trigger Engine confirmed entry. */
  triggerTriggered: boolean;
  /** True when every Risk Engine guard is satisfied. */
  riskCleared: boolean;
  /**
   * True when safety-critical market data is present and valid: a fresh market
   * snapshot and, in LIVE mode, a mandatory spread quote. Missing
   * safety-critical data fails closed instead of being assumed healthy.
   */
  marketDataValid?: boolean;
}

/**
 * Evaluate the execution gate.
 *
 * Priority order matters and is intentional:
 *  - INVALIDATED beats everything: a broken setup is discarded immediately.
 *  - BLOCKED next: a valid setup that trips a risk guard must never execute.
 *  - EXECUTE only when setup + trigger + risk all agree.
 *  - WAIT is the safe default whenever information is incomplete.
 */
export function decideExecution(input: DecisionInput): ExecutionDecision {
  const { setupValid, triggerTriggered, riskCleared, marketDataValid } = input;

  if (!setupValid) {
    return "INVALIDATED";
  }

  if (!riskCleared) {
    return "BLOCKED";
  }

  // Safety-critical data must exist before an execution decision is trusted.
  if (marketDataValid === false) {
    return "BLOCKED";
  }

  if (triggerTriggered) {
    return "EXECUTE";
  }

  return "WAIT";
}

/** Human-readable explanation for a decision, useful for the dashboard log. */
export function explainDecision(decision: ExecutionDecision): string {
  switch (decision) {
    case "EXECUTE":
      return "All gates passed (setup, trigger, risk). Signal is valid.";
    case "WAIT":
      return "Setup is valid but the entry trigger has not fired yet.";
    case "BLOCKED":
      return "A risk guard prevented execution. Review exposure and retry.";
    case "INVALIDATED":
      return "Setup structure failed. The signal is no longer valid.";
    default: {
      const exhaustive: never = decision;
      throw new Error(`Unknown execution decision: ${String(exhaustive)}`);
    }
  }
}
