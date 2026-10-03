import type {
  CurrencyPair,
  MarketSnapshot,
  Timeframe,
} from "@/types/market";
import type {
  BiasResultData,
  EngineResult,
  ExecutionResultData,
  RegimeResultData,
  RiskResultData,
  SetupResultData,
  StructureResultData,
  TriggerResultData,
} from "@/types/engine";
import type { ExecutionContext, Veto } from "@/core/execution";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import type { StrategyConfigBundle } from "@/core/strategies/config";

/** Input snapshot for a single timeframe. */
export interface TimeframeInput {
  timeframe: Timeframe;
  snapshot: MarketSnapshot;
}

export interface AnalysisContext {
  instrument: CurrencyPair;
  /** Optional D1 macro context used as a directional safety filter. */
  macroTimeframe?: TimeframeInput;
  /** Snapshot used for structure / regime / bias (the directional view). */
  biasTimeframe: TimeframeInput;
  /** Snapshot used for setup / zone detection. Defaults to the bias timeframe. */
  setupTimeframe?: TimeframeInput;
  /** Snapshot used for trigger confirmation. Defaults to the setup timeframe. */
  triggerTimeframe?: TimeframeInput;
  accountBalance: number;
  /** Currency the trading account is denominated in, e.g. "USD". Required. */
  accountCurrency: string;
  riskPercent?: number;
  /** Optional pre-selected targets; otherwise derived from the minimum R multiple. */
  targetLevels?: number[];
  /**
   * Conversion rate from the instrument quote currency to the account
   * currency, forwarded to the Risk Engine for account-correct position sizing.
   * Required for any instrument whose quote currency differs from
   * accountCurrency; the Risk Engine rejects rather than defaulting it to 1.
   */
  quoteToAccountConversionRate?: number;
  execution?: Partial<ExecutionContext>;
  configOverrides?: DeepPartial<EngineConfig>;
  /** Strategy-specific thresholds; pinned by release governance when ACTIVE. */
  strategyConfigOverrides?: DeepPartial<StrategyConfigBundle>;
  vetoes?: Veto[];
}

export interface PipelineResult {
  structure: EngineResult<StructureResultData>;
  regime: EngineResult<RegimeResultData>;
  bias: EngineResult<BiasResultData>;
  setup: EngineResult<SetupResultData>;
  /** Setup-timeframe structure already computed for zone construction. */
  setupStructure: EngineResult<StructureResultData>;
  trigger: EngineResult<TriggerResultData> | null;
  risk: EngineResult<RiskResultData> | null;
  execution: EngineResult<ExecutionResultData> | null;
}
