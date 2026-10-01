export { decideExecution, explainDecision } from "./decision";
export type { DecisionInput } from "./decision";
export { decide } from "./execution-engine";
export type { ExecutionInput } from "./execution-engine";
export {
  DEFAULT_VETOES,
  evaluateVetoes,
  STALE_DATA_VETO,
  RR_TOO_LOW_VETO,
  INVALID_STOP_VETO,
  RISK_TOO_HIGH_VETO,
  SPREAD_TOO_WIDE_VETO,
  NEWS_BLOCK_VETO,
  CORRELATION_LIMIT_VETO,
  DAILY_RISK_LIMIT_VETO,
  MACRO_ALIGNMENT_VETO,
  REGIME_COMPATIBILITY_VETO,
  SIGNAL_EXPIRED_VETO,
} from "./veto";
export type {
  ExecutionContext,
  Veto,
  VetoContext,
  VetoOutcome,
  VetoEvaluation,
} from "./veto";
