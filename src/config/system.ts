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
 * "SIGNAL ONLY" is the only mode permitted in Phase 1: the engine decides and
 * reports, but never routes an order to a broker.
 */
export type ExecutionMode = "SIGNAL ONLY" | "PAPER" | "LIVE";

export const systemConfig = {
  status: "Development" as SystemStatusValue,
  coreEngine: "Not Initialized" as CoreEngineState,
  marketScanner: "Not Connected" as ScannerConnectionState,
  executionMode: "SIGNAL ONLY" as ExecutionMode,
} as const;

export type SystemConfig = typeof systemConfig;
