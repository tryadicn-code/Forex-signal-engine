import { DEFAULT_ACCOUNT } from "@/config/scanner";

export type IntrabarConflictPolicy = "STOP_FIRST" | "TARGET_FIRST" | "REJECT_AMBIGUOUS";

export interface PaperTradingConfig {
  enabled: boolean;
  accountCurrency: string;
  initialBalance: number;
  maxOpenPositions: number;
  maxTotalOpenRiskPercent: number;
  /** Hard cap per symbol so one setup cannot stack repeated entries. */
  maxOpenPositionsPerSymbol: number;
  /** Max positions sharing the same directional currency leg (e.g. JPY LONG). */
  maxDirectionalCurrencyExposure: number;
  /** Cooldown after a stop loss before the same symbol may open again. */
  stopLossReentryCooldownMs: number;
  intrabarConflictPolicy: IntrabarConflictPolicy;
  /** Run the scanner continuously while the Phase 4 server process is alive. */
  autoScanEnabled: boolean;
  /** Server-side scan cadence. M15 strategy defaults to a conservative 60s poll. */
  autoScanIntervalMs: number;
  /** Read-only browser sync cadence; never creates orders by itself. */
  dashboardSyncIntervalMs: number;
}

export const DEFAULT_PAPER_TRADING_CONFIG: PaperTradingConfig = {
  enabled: true,
  accountCurrency: DEFAULT_ACCOUNT.currency,
  initialBalance: DEFAULT_ACCOUNT.balance,
  maxOpenPositions: 10,
  maxTotalOpenRiskPercent: 5,
  maxOpenPositionsPerSymbol: 1,
  maxDirectionalCurrencyExposure: 2,
  stopLossReentryCooldownMs: 60 * 60_000,
  intrabarConflictPolicy: "STOP_FIRST",
  autoScanEnabled: true,
  autoScanIntervalMs: 60_000,
  dashboardSyncIntervalMs: 15_000,
};

export function resolvePaperTradingConfig(
  overrides?: Partial<PaperTradingConfig>
): PaperTradingConfig {
  return { ...DEFAULT_PAPER_TRADING_CONFIG, ...overrides };
}
