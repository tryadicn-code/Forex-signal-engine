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
import { analyzeStructure } from "@/core/structure";
import { classifyRegime } from "@/core/regime";
import { analyzeBias } from "@/core/bias";
import { analyzeSetup } from "@/core/setup";
import { evaluateTrigger } from "@/core/trigger";
import { evaluateRisk } from "@/core/risk";
import { decide } from "@/core/execution";
import type { ExecutionContext, Veto } from "@/core/execution";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import { last } from "@/core/indicators";

/** Input snapshot for a single timeframe. */
export interface TimeframeInput {
  timeframe: Timeframe;
  snapshot: MarketSnapshot;
}

export interface AnalysisContext {
  instrument: CurrencyPair;
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

/**
 * Pipeline orchestrator (Section 13 spec).
 *
 * This function contains NO trading logic. It only connects engines in the
 * required order and threads each stage output into the next:
 *
 *   Market Snapshot -> Structure -> Regime -> Bias -> Setup -> Trigger -> Risk
 *                     -> Execution Decision
 *
 * Timeframe isolation (audit finding #1): each stage analyses the candles of
 * its own timeframe. The bias timeframe drives structure / regime / bias; the
 * setup timeframe drives the setup structure and the Setup Engine; the trigger
 * timeframe drives the trigger structure and the Trigger Engine. A higher
 * timeframe reaches the Setup Engine only as price-only confluence - never as
 * an array index into another timeframe candles.
 *
 * Risk timing (audit finding #10): the Risk Engine runs only once the Trigger
 * Engine confirms an entry. Before that there is no entry candidate to size,
 * so risk stays NOT_EVALUATED and no provisional R:R is surfaced as execution
 * risk.
 */
export function analyzeMarket(context: AnalysisContext): PipelineResult {
  const config = resolveConfig(context.configOverrides);
  const { instrument, biasTimeframe } = context;
  const setupTimeframe = context.setupTimeframe ?? biasTimeframe;
  const triggerTimeframe = context.triggerTimeframe ?? setupTimeframe;
  const pipSize = instrument.pipSize;

  const biasAsOf = biasTimeframe.snapshot.asOf;
  const setupAsOf = setupTimeframe.snapshot.asOf;
  const triggerAsOf = triggerTimeframe.snapshot.asOf;

  // 1. Market Structure on the bias timeframe.
  const structure = analyzeStructure(
    biasTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    biasAsOf
  );

  // 2. Market Regime, built on top of structure.
  const regime = classifyRegime(
    biasTimeframe.snapshot.candles,
    structure.data,
    context.configOverrides,
    biasAsOf
  );

  // 3. Bias from structure + regime + trend + momentum.
  const bias = analyzeBias(
    biasTimeframe.snapshot.candles,
    structure.data,
    regime.data,
    context.configOverrides,
    biasAsOf
  );

  // 4. Setup on the setup timeframe. The setup structure is computed from the
  // setup candles themselves, so swing indexes resolve against the right
  // array; the bias-timeframe structure is passed only as price confluence and
  // only when it really is a different timeframe.
  const setupStructure = analyzeStructure(
    setupTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    setupAsOf
  );
  const distinctTimeframes =
    biasTimeframe.timeframe !== setupTimeframe.timeframe;
  const setup = analyzeSetup(
    setupTimeframe.snapshot.candles,
    bias.data,
    setupStructure.data,
    pipSize,
    context.configOverrides,
    distinctTimeframes ? structure.data : undefined,
    setupAsOf
  );

  // 5-7. Trigger, Risk and Execution only make sense for an actionable zone.
  if (
    setup.data.state === "NONE" ||
    setup.data.state === "INVALIDATED" ||
    bias.data.direction === "NEUTRAL"
  ) {
    return {
      structure,
      regime,
      bias,
      setup,
      setupStructure,
      trigger: null,
      risk: null,
      execution: null,
    };
  }

  // 5. Trigger confirmation on the trigger timeframe, on its own structure.
  const triggerStructure = analyzeStructure(
    triggerTimeframe.snapshot.candles,
    context.configOverrides,
    pipSize,
    triggerAsOf
  );
  const trigger = evaluateTrigger(
    triggerTimeframe.snapshot.candles,
    setup.data,
    triggerStructure.data,
    bias.data.direction,
    context.configOverrides,
    triggerAsOf
  );

  // 6. Risk on the frozen entry candidate, and only then. While the trigger is
  // still WAITING there is nothing to size, so no provisional R:R leaks into
  // the execution decision as if it had been approved.
  const entry =
    last(triggerTimeframe.snapshot.candles.map((c) => c.close)) ??
    (setup.data.zoneHigh + setup.data.zoneLow) / 2;
  const risk =
    trigger.data.state === "CONFIRMED"
      ? evaluateRisk(
          {
            entry,
            stop: setup.data.invalidationLevel,
            accountBalance: context.accountBalance,
            accountCurrency: context.accountCurrency,
            riskPercent: context.riskPercent ?? config.risk.defaultRiskPercent,
            instrument,
            targetLevels: context.targetLevels,
            direction: bias.data.direction,
            quoteToAccountConversionRate: context.quoteToAccountConversionRate,
            marketAsOf: triggerAsOf,
          },
          context.configOverrides
        )
      : null;

  // 7. Execution decision (never an order).
  const now = context.execution?.now ?? triggerAsOf;
  const execution = decide({
    bias: bias.data,
    setup: setup.data,
    trigger: trigger.data,
    risk: risk?.data ?? null,
    context: {
      now,
      riskPercent: context.riskPercent ?? config.risk.defaultRiskPercent,
      ...context.execution,
      // Feed the canonical trigger market time into the existing
      // SIGNAL_EXPIRED veto. Without this, the veto is always skipped and the
      // Execution Engine can continue reporting EXECUTE for an aged trigger.
      signalTimestamp:
        trigger.data.triggerTimestamp ??
        context.execution?.signalTimestamp,
    },
    snapshot: triggerTimeframe.snapshot,
    configOverrides: context.configOverrides,
    vetoes: context.vetoes,
  });

  return {
    structure,
    regime,
    bias,
    setup,
    setupStructure,
    trigger,
    risk,
    execution,
  };
}
