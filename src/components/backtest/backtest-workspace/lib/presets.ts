export type BacktestPreset = "demo" | "conservative" | "aggressive";

export interface PresetConfig {
  label: string;
  balance: string;
  riskPercent: string;
  maxOpenPositions: string;
  maxTotalRisk: string;
}

export const PRESETS: Record<BacktestPreset, PresetConfig> = {
  demo: {
    label: "Demo",
    balance: "10000",
    riskPercent: "0.5",
    maxOpenPositions: "10",
    maxTotalRisk: "5",
  },
  conservative: {
    label: "Conservative",
    balance: "10000",
    riskPercent: "0.25",
    maxOpenPositions: "5",
    maxTotalRisk: "2",
  },
  aggressive: {
    label: "Aggressive",
    balance: "10000",
    riskPercent: "1",
    maxOpenPositions: "20",
    maxTotalRisk: "10",
  },
};