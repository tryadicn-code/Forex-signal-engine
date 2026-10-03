import type { CurrencyPair, Direction } from "@/types/market";
import type { EngineResult, Evidence, RiskResultData } from "@/types/engine";
import { resolveConfig } from "@/core/config/engine-config";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import { engineTimestamp } from "@/core/indicators";

export interface RiskInput {
  entry: number;
  stop: number;
  accountBalance: number;
  /** Risk as a percentage of the account balance. Defaults to config default. */
  riskPercent?: number;
  instrument: CurrencyPair;
  /** Optional pre-selected targets; otherwise derived from min R multiple. */
  targetLevels?: number[];
  /** Trade direction, used to validate stop placement and project targets. */
  direction: Direction;
  /**
   * The currency the trading account is denominated in, e.g. "USD".
   *
   * The engine compares this against the instrument quote currency to decide
   * whether a conversion is needed at all. It never infers this and never
   * fetches a rate, keeping the engine pure and provider-agnostic.
   */
  accountCurrency: string;
  /**
   * Conversion rate from the instrument quote currency to the account currency.
   *
   * `contractSize * pipSize` values one pip of one lot in the QUOTE currency,
   * which only equals the account currency when they coincide (a USD account
   * trading EURUSD). For anything else - USDJPY, EURGBP, GBPJPY - the caller
   * supplies this rate so position sizing risk is measured in account terms.
   *
   * Final Phase 1 safety lock: when quote and account currency match the
   * conversion is 1 by definition and no external rate is required - ANY
   * supplied value is ignored for position sizing, because conversion is
   * unnecessary and a stale or wrong rate must never misprice a same-currency
   * leg. When the currencies differ, an explicit VALID rate is mandatory - a
   * missing, zero, negative or non-finite value rejects with
   * MISSING_ACCOUNT_CONVERSION_RATE or INVALID_ACCOUNT_CONVERSION_RATE instead
   * of silently defaulting to 1, which would misprice a JPY or cross pair by up
   * to ~150x. Phase 2's market-data provider layer is responsible for
   * supplying this rate.
   */
  quoteToAccountConversionRate?: number;
  /** Market time used for the result timestamp, for deterministic replay. */
  marketAsOf?: number;
}

/**
 * Risk Engine (Section 10 spec).
 *
 * Pure position-sizing arithmetic plus the hard gates: minimum reward-to-risk,
 * sane risk bounds and a valid stop. It never places a trade and never touches
 * an account - it only computes and approves.
 */
export function evaluateRisk(
  input: RiskInput,
  configOverrides?: DeepPartial<EngineConfig>
): EngineResult<RiskResultData> {
  const config = resolveConfig(configOverrides);
  const riskConfig = config.risk;
  const evidence: Evidence[] = [];
  const conflicts: Evidence[] = [];
  const { entry, stop, accountBalance, instrument, direction } = input;

  const riskPercent = input.riskPercent ?? riskConfig.defaultRiskPercent;
  const long = direction === "LONG";
  const stopDistance = Math.abs(entry - stop);
  const stopDistancePips =
    instrument.pipSize > 0 ? stopDistance / instrument.pipSize : 0;

  // Pip value in ACCOUNT currency (audit finding #8, final Phase 1 lock).
  //
  // When quote and account currency coincide, one pip of one lot is already
  // priced in account terms, so the effective conversion rate is 1 by
  // definition and is forced to 1 unconditionally. Any externally supplied rate
  // is IGNORED for position sizing on a same-currency leg - conversion is
  // unnecessary, so a stale, zero, NaN or otherwise wrong rate can never
  // misprice it. When the currencies differ the caller MUST supply a valid
  // rate; the engine never silently defaults a cross rate to 1 - that would
  // treat a ~6.67 USD/pip JPY leg as 1000 and misprice it by ~150x - and it
  // never fetches one itself, staying pure and provider-agnostic. A missing or
  // invalid rate rejects the trade instead of guessing.
  const sameCurrency = instrument.quote === input.accountCurrency;
  const suppliedRate = input.quoteToAccountConversionRate;
  const rateIsValid =
    typeof suppliedRate === "number" &&
    Number.isFinite(suppliedRate) &&
    suppliedRate > 0;

  let conversionRate: number;
  let conversionRejection: string | null = null;
  if (sameCurrency) {
    conversionRate = 1;
  } else if (suppliedRate === undefined) {
    conversionRejection = "MISSING_ACCOUNT_CONVERSION_RATE";
    conversionRate = 0;
  } else if (!rateIsValid) {
    conversionRejection = "INVALID_ACCOUNT_CONVERSION_RATE";
    conversionRate = 0;
  } else {
    conversionRate = suppliedRate;
  }
  const pipValuePerLotAccountCurrency =
    instrument.contractSize * instrument.pipSize * conversionRate;

  // Broker lot metadata: respect the instrument step and bounds instead of
  // assuming a universal 0.01 increment (audit finding #9).
  const lotStep = instrument.lotStep ?? 0.01;
  const minLot = instrument.minLot ?? 0;
  const maxLot = instrument.maxLot ?? riskConfig.maxLotSize;

  // Project targets when none were supplied: TP1 at the minimum R multiple.
  const derivedTp1 =
    entry + (long ? 1 : -1) * stopDistance * riskConfig.minRR;
  const derivedTp2 =
    entry + (long ? 1 : -1) * stopDistance * riskConfig.tp2RR;
  const targets =
    input.targetLevels && input.targetLevels.length > 0
      ? input.targetLevels
      : [derivedTp1, derivedTp2];

  // Nearest provided target that actually lies in the profit direction.
  const profitTargets = targets.filter((t) => (long ? t > entry : t < entry));
  const tp1 =
    profitTargets.length > 0
      ? profitTargets.reduce((a, b) =>
          Math.abs(b - entry) < Math.abs(a - entry) ? b : a
        )
      : derivedTp1;
  const tp2 =
    profitTargets.length > 1
      ? profitTargets.reduce((a, b) =>
          Math.abs(b - entry) > Math.abs(a - entry) ? b : a
        )
      : derivedTp2;

  const reward = Math.abs(tp1 - entry);
  const rr = stopDistance > 0 ? reward / stopDistance : 0;
  const riskCapital = (accountBalance * riskPercent) / 100;
  const rawSize =
    stopDistancePips > 0 && pipValuePerLotAccountCurrency > 0
      ? riskCapital / (stopDistancePips * pipValuePerLotAccountCurrency)
      : 0;
  const positionSize = sizeToLotStep(rawSize, lotStep, minLot, maxLot);

  const stopOnCorrectSide = long ? stop < entry : stop > entry;
  const reasons: string[] = [];

  if (conversionRejection) reasons.push(conversionRejection);
  if (!stopOnCorrectSide) reasons.push("INVALID_STOP");
  if (stopDistance <= 0) reasons.push("INVALID_STOP");
  if (!(rr >= riskConfig.minRR)) reasons.push("RR_TOO_LOW");
  if (!(riskPercent >= riskConfig.minRiskPercent)) reasons.push("RISK_BELOW_FLOOR");
  if (!(riskPercent <= riskConfig.maxRiskPercent)) reasons.push("RISK_TOO_HIGH");
  if (!(accountBalance > 0)) reasons.push("NO_BALANCE");
  // A cross-currency rejection already explains why nothing could be sized.
  if (!(positionSize > 0) && !conversionRejection)
    reasons.push("POSITION_TOO_SMALL");
  if (!(positionSize <= maxLot)) reasons.push("POSITION_TOO_LARGE");

  evidence.push({
    code: "RISK_CAPITAL",
    label: "Risk capital",
    description: `${riskPercent}% of balance ${accountBalance} = ${riskCapital.toFixed(2)} in account currency.`,
    value: riskCapital,
  });
  evidence.push({
    code: "STOP_DISTANCE",
    label: "Stop distance",
    description: `${stopDistance.toFixed(5)} price units = ${stopDistancePips.toFixed(1)} pips.`,
    value: stopDistancePips,
  });
  evidence.push({
    code: "POSITION_SIZE",
    label: "Position size",
    description: `${positionSize} lots at ${pipValuePerLotAccountCurrency.toFixed(2)} account-currency per pip per lot (step ${lotStep}, min ${minLot}, max ${maxLot}).`,
    value: positionSize,
  });
  evidence.push({
    code: "REWARD_RISK",
    label: "Reward-to-risk",
    description: `TP1 ${tp1} gives reward ${reward.toFixed(5)} against risk ${stopDistance.toFixed(5)}: R:R ${rr.toFixed(2)} (minimum ${riskConfig.minRR}).`,
    value: rr,
  });

  if (!(rr >= riskConfig.minRR)) {
    conflicts.push({
      code: "RR_TOO_LOW",
      label: "Reward-to-risk below minimum",
      description: `R:R ${rr.toFixed(2)} is below the hard minimum of ${riskConfig.minRR}.`,
      value: rr,
    });
  }
  if (!(riskPercent <= riskConfig.maxRiskPercent)) {
    conflicts.push({
      code: "RISK_TOO_HIGH",
      label: "Risk above maximum",
      description: `Requested ${riskPercent}% exceeds the ${riskConfig.maxRiskPercent}% hard cap.`,
      value: riskPercent,
    });
  }

  if (sameCurrency) {
    evidence.push({
      code: "ACCOUNT_CONVERSION_NOT_REQUIRED",
      label: "Account-currency conversion not required",
      description:
        suppliedRate === undefined
          ? `Quote currency ${instrument.quote} matches the account currency ${input.accountCurrency}: the effective conversion rate is 1 by definition and no external rate is required.`
          : `Quote currency ${instrument.quote} matches the account currency ${input.accountCurrency}: the effective conversion rate is 1 by definition, so the supplied rate of ${suppliedRate} is ignored for position sizing.`,
      value: conversionRate,
    });
  } else {
    evidence.push({
      code: "ACCOUNT_CONVERSION",
      label: "Account-currency conversion",
      description: `Quote currency ${instrument.quote} converted to account currency ${input.accountCurrency} at ${conversionRate}.`,
      value: conversionRate,
    });
  }

  if (conversionRejection) {
    conflicts.push({
      code: conversionRejection,
      label: "Account-currency conversion unavailable",
      description:
        conversionRejection === "MISSING_ACCOUNT_CONVERSION_RATE"
          ? `Instrument ${instrument.code} quotes in ${instrument.quote}, which differs from the account currency ${input.accountCurrency}; a quote-to-account conversion rate is required and none was supplied.`
          : `Instrument ${instrument.code} quotes in ${instrument.quote}, which differs from the account currency ${input.accountCurrency}; the supplied rate is zero, negative or not finite.`,
      value: typeof suppliedRate === "number" ? suppliedRate : 0,
    });
  }

  const approved = reasons.length === 0;

  const data: RiskResultData = {
    riskCapital,
    stopDistance,
    stopDistancePips,
    positionSize,
    rr,
    tp1,
    tp2,
    approved,
    rejectionReason: approved ? null : reasons.join(","),
  };

  return {
    status: approved ? "RISK_APPROVED" : `RISK_REJECTED`,
    score: Math.round(Math.min(100, rr * 25)),
    evidence,
    conflicts,
    data,
    timestamp: engineTimestamp(input.marketAsOf),
  };
}

/**
 * Round a raw lot size down to the broker step, then reject anything below the
 * minimum instead of rounding it up and overshooting the requested risk.
 */
function sizeToLotStep(
  rawSize: number,
  lotStep: number,
  minLot: number,
  maxLot: number
): number {
  if (rawSize <= 0) return 0;
  const stepped =
    lotStep > 0
      ? Math.floor(rawSize / lotStep) * lotStep
      : rawSize;
  if (stepped < minLot) return 0;
  return Math.min(stepped, maxLot);
}
