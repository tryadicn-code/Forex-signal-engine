/**
 * System-level configuration.
 *
 * Single source of truth for the operational state shown on the dashboard.
 * Phase 1 values are static; later phases will derive these from live state.
 */

export type SystemStatusValue = "Development" | "Staging" | "Production";

export type CoreEngineState = "Not Initialized" | "Initialized" | "Running";

export type ScannerConnectionState = "Not Connected" | "Connected" | "Error";

/**
 * Execution mode.
 *
 * Phase 1 baseline remains SIGNAL ONLY. Later workstation phases may present
 * their own operational mode without rewriting this locked baseline.
 */
export type ExecutionMode = "SIGNAL ONLY" | "PAPER" | "LIVE";

export const systemConfig = {
  status: "Development" as SystemStatusValue,
  coreEngine: "Not Initialized" as CoreEngineState,
  marketScanner: "Not Connected" as ScannerConnectionState,
  executionMode: "SIGNAL ONLY" as ExecutionMode,
} as const;

export type SystemConfig = typeof systemConfig;
