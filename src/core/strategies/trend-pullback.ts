import type { AnalysisContext, PipelineResult } from "@/core/orchestrator/types";
import type { Direction } from "@/types/market";
import type { StrategyDefinition } from "@/core/strategies/types";
import { analyzeStructure } from "@/core/structure";
import { classifyRegime } from "@/core/regime";
import { analyzeBias } from "@/core/bias";
import { analyzeSetup } from "@/core/setup";
import { evaluateTrigger } from "@/core/trigger";
import { evaluateRisk } from "@/core/risk";
import { deriveStructuralTargetLevels } from "@/core/risk/structural-targets";
import { decide } from "@/core/execution";
import { resolveConfig } from "@/core/config/engine-config";

import { resolveEntryPrice } from "@/core/strategies/entry-price";

export const TREND_PULLBACK_STRATEGY_ID = "TREND_PULLBACK" as const;

/**
 * TREND_PULLBACK strategy.
 *
 * This is the exact strategy path that previously lived directly in the
 * orchestrator. Phase 12.2 only gives it a stable strategy boundary; stage
 * ordering, thresholds, calculations, vetoes, and execution semantics remain
 * unchanged.
 *
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
export function analyzeTrendPullback(context: AnalysisContext): PipelineResult {
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


  // D1 is a macro safety filter rather than another scoring component. A
  // neutral D1 does not block an H4 opportunity, but a directional D1 that
  // opposes the H4 bias prevents execution through a hard veto later.
  const macroTimeframe = context.macroTimeframe;
  const macroAsOf = macroTimeframe?.snapshot.asOf;
  let macroDirection: Direction | undefined;
  let macroAlignment: "ALIGNED" | "NEUTRAL" | "OPPOSED" | undefined;
  if (macroTimeframe && macroAsOf !== undefined) {
    const macroStructure = analyzeStructure(
      macroTimeframe.snapshot.candles,
      context.configOverrides,
      pipSize,
      macroAsOf
    );
    const macroRegime = classifyRegime(
      macroTimeframe.snapshot.candles,
      macroStructure.data,
      context.configOverrides,
      macroAsOf
    );
    const macroBias = analyzeBias(
      macroTimeframe.snapshot.candles,
      macroStructure.data,
      macroRegime.data,
      context.configOverrides,
      macroAsOf
    );
    macroDirection = macroBias.data.direction;
    macroAlignment =
      macroDirection === "NEUTRAL" || bias.data.direction === "NEUTRAL"
        ? "NEUTRAL"
        : macroDirection === bias.data.direction
          ? "ALIGNED"
          : "OPPOSED";
  }

  const regimeCompatible =
    bias.data.direction !== "NEUTRAL" &&
    ((regime.data.baseRegime === "TREND_UP" &&
      bias.data.direction === "LONG") ||
      (regime.data.baseRegime === "TREND_DOWN" &&
        bias.data.direction === "SHORT") ||
      (regime.data.baseRegime === "BREAKOUT" &&
        regime.data.direction === bias.data.direction));
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
  // C2: scanner delivers closed-only snapshots. Only strip the last bar when
  // the caller explicitly says it may still be forming (closedOnly === false).
  const triggerCandles =
    context.closedOnly === false
      ? triggerTimeframe.snapshot.candles.slice(0, -1)
      : triggerTimeframe.snapshot.candles;
  const trigger = evaluateTrigger(
    triggerCandles,
    setup.data,
    triggerStructure.data,
    bias.data.direction,
    context.configOverrides,
    triggerAsOf
  );

  // 6. Risk on the frozen entry candidate, and only then. While the trigger is
  // still WAITING there is nothing to size, so no provisional R:R leaks into
  // the execution decision as if it had been approved.
  const entry = resolveEntryPrice(triggerCandles, setup.data, trigger.data);
  const explicitTargets =
    context.targetLevels && context.targetLevels.length > 0
      ? context.targetLevels
      : undefined;
  const structuralTargets = explicitTargets
    ? []
    : deriveStructuralTargetLevels({
        entry,
        direction: bias.data.direction,
        pipSize,
        setupStructure: setupStructure.data,
        biasStructure: distinctTimeframes ? structure.data : undefined,
        bufferPips: config.risk.structuralTargetBufferPips,
      });

  // Structure is used as a clearance gate, not as permission to stretch TP
  // farther than the strategy's baseline target. If the nearest confirmed
  // obstacle sits inside the minimum-R window, pass that obstacle to the Risk
  // Engine so RR_TOO_LOW rejects the trade. Otherwise the Risk Engine keeps its
  // normal 2R baseline. Explicit caller targets retain their existing meaning.
  const minimumTargetDistance =
    Math.abs(entry - setup.data.invalidationLevel) * config.risk.minRR;
  const nearestStructuralTarget = structuralTargets[0];
  const targetLevelsForRisk = explicitTargets
    ? explicitTargets
    : nearestStructuralTarget !== undefined &&
        Math.abs(nearestStructuralTarget - entry) < minimumTargetDistance
      ? [nearestStructuralTarget]
      : undefined;

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
            targetLevels: targetLevelsForRisk,
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
      macroAlignment,
      macroDirection,
      regime: regime.data.regime,
      regimeCompatible,
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


export const TREND_PULLBACK_STRATEGY: StrategyDefinition = {
  id: TREND_PULLBACK_STRATEGY_ID,
  analyze: analyzeTrendPullback,
};
