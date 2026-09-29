import type { MarketSnapshot, ExecutionMode } from "@/types/market";
import type {
  BiasResultData,
  ConditionCheck,
  EngineResult,
  Evidence,
  ExecutionResultData,
  RiskResultData,
  SetupResultData,
  TriggerResultData,
} from "@/types/engine";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import { decideExecution } from "./decision";
import {
  DEFAULT_VETOES,
  evaluateVetoes,
  type ExecutionContext,
  type Veto,
  type VetoEvaluation,
} from "./veto";

export interface ExecutionInput {
  bias: BiasResultData;
  setup: SetupResultData;
  trigger: TriggerResultData;
  /**
   * Risk result. Null while the trigger is unconfirmed and risk has therefore
   * not been evaluated - never a provisional number presented as approved risk.
   */
  risk: RiskResultData | null;
  context: ExecutionContext;
  snapshot?: MarketSnapshot;
  configOverrides?: DeepPartial<EngineConfig>;
  /** Override the default veto registry, e.g. to add a strategy-specific veto. */
  vetoes?: Veto[];
}

/**
 * Execution Engine (Section 11 spec).
 *
 * The final gate. It never routes an order to a broker: it maps the upstream
 * results, plus the operational context, onto one of four decisions. Every
 * mandatory condition and every hard veto is recorded as evidence so the
 * dashboard can always explain why a signal did or did not fire.
 *
 * Fail-closed behaviour (audit finding #11): safety-critical market data is
 * assumed UNHEALTHY when it is missing. A absent snapshot always fails the
 * freshness gate, and in LIVE mode a missing spread quote blocks as well.
 * SIGNAL_ONLY and PAPER tolerate absent optional providers - they surface as
 * not evaluated instead - because they never route a real order.
 */
export function decide(input: ExecutionInput): EngineResult<ExecutionResultData> {
  const config = resolveConfig(input.configOverrides);
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const { bias, setup, trigger, risk, context, snapshot } = input;

  const mode: ExecutionMode = context.mode ?? "SIGNAL_ONLY";

  // --- Mandatory conditions (Section 11). ---
  const biasValid =
    bias.direction !== "NEUTRAL" &&
    Math.abs(bias.score) >= config.bias.biasThreshold;
  const setupValid = setup.state === "SETUP" || setup.state === "ARMED";
  const triggerConfirmed = trigger.state === "CONFIRMED";
  const riskApproved = risk?.approved ?? false;

  // Freshness fails closed: no snapshot means the data cannot be trusted,
  // rather than being assumed fresh (audit finding #11).
  const hasSnapshot = snapshot !== undefined;
  const dataAgeMs =
    context.marketDataAgeMs ??
    (hasSnapshot ? context.now - snapshot.asOf : 0);
  const dataFresh =
    hasSnapshot &&
    (context.marketDataFreshness !== undefined
      ? context.marketDataFreshness === "FRESH"
      : dataAgeMs <= config.execution.maxDataAgeMs);

  // Spread is mandatory only in LIVE; elsewhere the provider may omit it.
  const spreadPips = context.spreadPips ?? snapshot?.spreadPips;
  const spreadKnown = spreadPips !== undefined;
  const spreadWithinLimit = spreadKnown
    ? spreadPips <= config.execution.maxSpreadPips
    : mode !== "LIVE";
  const marketDataValid = dataFresh && spreadWithinLimit;

  const conditions: ConditionCheck[] = [
    {
      name: "bias_valid",
      passed: biasValid,
      detail: biasValid
        ? `Bias ${bias.label} (score ${bias.score}) clears the +/-${config.bias.biasThreshold} threshold.`
        : `Bias ${bias.label} (score ${bias.score}) does not clear the +/-${config.bias.biasThreshold} threshold.`,
    },
    {
      name: "setup_valid",
      passed: setupValid,
      detail: setupValid
        ? `Setup state ${setup.state} with zone [${setup.zoneLow}, ${setup.zoneHigh}].`
        : `Setup state is ${setup.state}; no actionable zone.`,
    },
    {
      name: "trigger_confirmed",
      passed: triggerConfirmed,
      detail: triggerConfirmed
        ? `Trigger ${trigger.triggerType} confirmed ${trigger.ageInBars === null ? "" : `(${trigger.ageInBars} bars ago)`}.`
        : `Trigger state is ${trigger.state}.`,
    },
    {
      name: "risk_approved",
      passed: riskApproved,
      detail: risk
        ? riskApproved
          ? `Risk approved: R:R ${risk.rr.toFixed(2)}, size ${risk.positionSize} lots.`
          : `Risk rejected: ${risk.rejectionReason ?? "unknown reason"}.`
        : `Risk not evaluated: the trigger is ${trigger.state}, so no entry candidate was sized.`,
    },
    {
      name: "data_fresh",
      passed: dataFresh,
      detail: hasSnapshot
        ? context.marketDataFreshness !== undefined
          ? `Scanner freshness is ${context.marketDataFreshness}; data age is ${Math.round(dataAgeMs / 1000)}s.`
          : `Data is ${Math.round(dataAgeMs / 1000)}s old (max ${Math.round(config.execution.maxDataAgeMs / 1000)}s).`
        : "No market snapshot supplied; freshness could not be verified, so the gate fails closed.",
    },
    {
      name: "spread_within_limit",
      passed: spreadWithinLimit,
      detail: spreadKnown
        ? `Spread is ${spreadPips} pips (max ${config.execution.maxSpreadPips}).`
        : mode === "LIVE"
          ? "LIVE mode requires a spread quote and none was supplied; the gate fails closed."
          : "No spread supplied; not required outside LIVE mode.",
    },
  ];

  // --- Hard vetoes (Section 12). ---
  const vetoEvaluations = evaluateVetoes(
    {
      snapshot,
      risk: risk ?? undefined,
      setup,
      trigger,
      bias,
      execution: context,
      config,
    },
    input.vetoes ?? DEFAULT_VETOES
  );

  const triggeredVetoes: string[] = [];
  for (const evaluation of vetoEvaluations) {
    const { veto, outcome } = evaluation;
    if (outcome.triggered) {
      triggeredVetoes.push(veto.code);
      conflicts.push({
        code: `VETO_${veto.code}`,
        label: veto.label,
        description: outcome.reason ?? veto.description,
      });
    } else if (outcome.skipped) {
      evidence.push({
        code: `VETO_${veto.code}_SKIPPED`,
        label: `${veto.label} not evaluated`,
        description: outcome.reason ?? "Required data is unavailable.",
      });
    } else {
      evidence.push({
        code: `VETO_${veto.code}_PASS`,
        label: `${veto.label} passed`,
        description: veto.description,
      });
    }
  }

  const noHardVeto = triggeredVetoes.length === 0;
  conditions.push({
    name: "no_hard_veto",
    passed: noHardVeto,
    detail: noHardVeto
      ? "No hard veto fired."
      : `Hard vetoes fired: ${triggeredVetoes.join(", ")}.`,
  });

  // --- Decision ladder. ---
  // Structural failure outranks everything; a hard veto outranks everything
  // else; an unconfirmed trigger waits rather than being blocked on a risk
  // result that was deliberately never computed; only then does the pure gate
  // map the remainder.
  let decision: ExecutionResultData["decision"];
  if (setup.state === "INVALIDATED" || trigger.state === "INVALIDATED") {
    decision = "INVALIDATED";
  } else if (!noHardVeto) {
    decision = "BLOCKED";
  } else if (!biasValid) {
    decision = "WAIT";
  } else if (!triggerConfirmed) {
    decision = "WAIT";
  } else {
    decision = decideExecution({
      setupValid,
      triggerTriggered: triggerConfirmed,
      riskCleared: riskApproved,
      marketDataValid,
    });
  }

  const reasons: string[] = [];
  for (const condition of conditions) {
    reasons.push(
      `${condition.passed ? "PASS" : "FAIL"} ${condition.name}: ${condition.detail}`
    );
  }
  for (const evaluation of vetoEvaluations as VetoEvaluation[]) {
    if (evaluation.outcome.triggered) {
      reasons.push(`VETO ${evaluation.veto.code}: ${evaluation.outcome.reason}`);
    }
  }

  for (const condition of conditions) {
    evidence.push({
      code: `CONDITION_${condition.name.toUpperCase()}`,
      label: condition.name,
      description: condition.detail,
      value: condition.passed,
    });
  }

  const data: ExecutionResultData = {
    decision,
    conditions,
    triggeredVetoes,
    reasons,
  };

  return {
    status: `EXECUTION_${decision}`,
    score: decision === "EXECUTE" ? 100 : decision === "WAIT" ? 0 : 50,
    evidence,
    conflicts,
    data,
    timestamp: new Date(context.now).toISOString(),
  };
}
