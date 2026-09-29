import { DEFAULT_ACCOUNT } from "@/config/scanner";

export type IntrabarConflictPolicy = "STOP_FIRST" | "TARGET_FIRST" | "REJECT_AMBIGUOUS";

export interface PaperTradingConfig {
  enabled: boolean;
  accountCurrency: string;
  initialBalance: number;
  maxOpenPositions: number;
  maxTotalOpenRiskPercent: number;
  intrabarConflictPolicy: IntrabarConflictPolicy;
}

export const DEFAULT_PAPER_TRADING_CONFIG: PaperTradingConfig = {
  enabled: true,
  accountCurrency: DEFAULT_ACCOUNT.currency,
  initialBalance: DEFAULT_ACCOUNT.balance,
  maxOpenPositions: 10,
  maxTotalOpenRiskPercent: 5,
  intrabarConflictPolicy: "STOP_FIRST",
};

export function resolvePaperTradingConfig(
  overrides?: Partial<PaperTradingConfig>
): PaperTradingConfig {
  return { ...DEFAULT_PAPER_TRADING_CONFIG, ...overrides };
}
