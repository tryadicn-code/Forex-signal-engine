import type {
  Direction,
  MarketSnapshot,
  ExecutionMode,
  RegimeLabel,
} from "@/types/market";
import type {
  BiasResultData,
  RiskResultData,
  SetupResultData,
  TriggerResultData,
} from "@/types/engine";
import type { EngineConfig } from "@/core/config/engine-config";

/**
 * Operational context the veto framework needs but that does not belong in any
 * single engine result: the current time, requested risk, and external state
 * such as news windows and correlation exposure.
 */
export interface ExecutionContext {
  /** Deployment mode; defaults to SIGNAL_ONLY when unset (Section 11 spec). */
  mode?: ExecutionMode;
  /** Current time as UTC epoch milliseconds. */
  now: number;
  /**
   * Scanner-level freshness classification for the canonical multi-timeframe
   * context. When supplied it takes precedence over the Phase 1 absolute-age
   * fallback because closed-candle strategies are timeframe-relative.
   */
  marketDataFreshness?: "FRESH" | "DELAYED" | "STALE";
  /** Age of the canonical trigger-timeframe market data, in milliseconds. */
  marketDataAgeMs?: number;
  /** Current provider spread in pips, when available. */
  spreadPips?: number;
  /** Risk percentage requested for this trade. */
  riskPercent?: number;
  /** True when high-impact news is due within the block window. */
  newsPending?: boolean;
  /** Open positions highly correlated with this instrument. */
  correlatedPositions?: number;
  /** Configured ceiling on correlated positions. */
  maxCorrelated?: number;
  /** Risk already consumed today, as a percentage of the account. */
  dailyRiskUsedPercent?: number;
  /** Configured daily risk ceiling, as a percentage of the account. */
  dailyRiskLimitPercent?: number;
  /** When the signal was created, as UTC epoch milliseconds. */
  signalTimestamp?: number;
  /** D1 macro alignment relative to the H4 trading bias. */
  macroAlignment?: "ALIGNED" | "NEUTRAL" | "OPPOSED";
  /** Direction produced by the D1 macro context, when available. */
  macroDirection?: Direction;
  /** H4 regime label used by the strategy-compatibility gate. */
  regime?: RegimeLabel;
  /** Whether the H4 regime is compatible with the current directional strategy. */
  regimeCompatible?: boolean;
}

/**
 * The time a veto should reason in.
 *
 * Prefers an explicitly injected clock, then the market snapshot time, and only
 * falls back to the wall clock when neither is available. Keeping historical
 * replay deterministic matters more than knowing the real time: a backtest must
 * be able to reproduce identical veto outcomes.
 */
function marketTime(context: VetoContext): number {
  return context.execution?.now ?? context.snapshot?.asOf ?? Date.now();
}

/** Everything a veto is allowed to inspect. */
export interface VetoContext {
  snapshot?: MarketSnapshot;
  risk?: RiskResultData;
  setup?: SetupResultData;
  trigger?: TriggerResultData;
  bias?: BiasResultData;
  execution?: Partial<ExecutionContext>;
  config: EngineConfig;
}

export interface VetoOutcome {
  triggered: boolean;
  /** Why it fired, or why it was skipped when its data is unavailable. */
  reason?: string;
  /** True when the veto could not be evaluated (no provider yet). */
  skipped?: boolean;
}

/**
 * A reusable hard veto (Section 12 spec).
 *
 * A veto is a kill switch, not a scoring input: if any registered veto fires,
 * the Execution Engine may not return EXECUTE, regardless of every other gate.
 */
export interface Veto {
  code: string;
  label: string;
  description: string;
  evaluate(context: VetoContext): VetoOutcome;
}

export const STALE_DATA_VETO: Veto = {
  code: "STALE_DATA",
  label: "Stale market data",
  description: "Blocks execution when the latest market data is older than the configured maximum age.",
  evaluate(context) {
    const snapshot = context.snapshot;
    if (!snapshot) {
      return { triggered: false, skipped: true, reason: "No market snapshot supplied." };
    }

    const scannerFreshness = context.execution?.marketDataFreshness;
    const scannerAge = context.execution?.marketDataAgeMs;
    if (scannerFreshness !== undefined) {
      if (scannerFreshness === "STALE") {
        return {
          triggered: true,
          reason:
            scannerAge === undefined
              ? "Scanner classified the market data as STALE."
              : `Scanner classified the market data as STALE (${Math.round(scannerAge / 1000)}s old).`,
        };
      }
      return { triggered: false };
    }

    const maxAge = context.config.execution.maxDataAgeMs;
    const now = marketTime(context);
    const age = now - snapshot.asOf;
    if (age > maxAge) {
      return {
        triggered: true,
        reason: `Market data is ${Math.round(age / 1000)}s old, exceeding the ${Math.round(maxAge / 1000)}s maximum.`,
      };
    }
    return { triggered: false };
  },
};

export const RR_TOO_LOW_VETO: Veto = {
  code: "RR_TOO_LOW",
  label: "Reward-to-risk too low",
  description: "Blocks execution when the projected reward-to-risk is below the hard minimum.",
  evaluate(context) {
    const minRR = context.config.risk.minRR;
    const risk = context.risk;
    if (!risk) {
      return { triggered: false, skipped: true, reason: "No risk result supplied." };
    }
    if (risk.rr < minRR) {
      return {
        triggered: true,
        reason: `R:R ${risk.rr.toFixed(2)} is below the hard minimum ${minRR}.`,
      };
    }
    return { triggered: false };
  },
};

export const INVALID_STOP_VETO: Veto = {
  code: "INVALID_STOP",
  label: "Invalid stop loss",
  description: "Blocks execution when the stop distance is missing, zero, or degenerate.",
  evaluate(context) {
    const risk = context.risk;
    if (!risk) {
      return { triggered: false, skipped: true, reason: "No risk result supplied." };
    }
    if (!(risk.stopDistance > 0)) {
      return {
        triggered: true,
        reason: `Stop distance of ${risk.stopDistance} is invalid.`,
      };
    }
    return { triggered: false };
  },
};

export const RISK_TOO_HIGH_VETO: Veto = {
  code: "RISK_TOO_HIGH",
  label: "Risk exceeds maximum",
  description: "Blocks execution when the requested risk percentage exceeds the configured cap.",
  evaluate(context) {
    const maxRisk = context.config.risk.maxRiskPercent;
    const requested = context.execution?.riskPercent;
    if (requested === undefined) {
      return { triggered: false, skipped: true, reason: "No explicit risk requested; the Risk Engine's own bounds were applied." };
    }
    if (requested > maxRisk) {
      return {
        triggered: true,
        reason: `Requested risk of ${requested}% exceeds the ${maxRisk}% cap.`,
      };
    }
    return { triggered: false };
  },
};

export const SPREAD_TOO_WIDE_VETO: Veto = {
  code: "SPREAD_TOO_WIDE",
  label: "Spread too wide",
  description: "Blocks execution when the current spread is wider than the configured maximum.",
  evaluate(context) {
    const maxSpread = context.config.execution.maxSpreadPips;
    const spread =
      context.execution?.spreadPips ?? context.snapshot?.spreadPips;
    if (spread === undefined) {
      return { triggered: false, skipped: true, reason: "Provider did not supply spread data." };
    }
    if (spread > maxSpread) {
      return {
        triggered: true,
        reason: `Spread of ${spread} pips exceeds the ${maxSpread}-pip maximum.`,
      };
    }
    return { triggered: false };
  },
};

export const NEWS_BLOCK_VETO: Veto = {
  code: "NEWS_BLOCK",
  label: "High-impact news window",
  description: "Blocks execution during high-impact news. Placeholder: no economic-calendar provider exists yet, so it only fires when the caller flags news pending.",
  evaluate(context) {
    if (context.execution?.newsPending === undefined) {
      return { triggered: false, skipped: true, reason: "No economic-calendar provider connected." };
    }
    if (context.execution.newsPending) {
      return {
        triggered: true,
        reason: "High-impact news is pending; trading is blocked for the news window.",
      };
    }
    return { triggered: false };
  },
};

export const CORRELATION_LIMIT_VETO: Veto = {
  code: "CORRELATION_LIMIT",
  label: "Correlation limit reached",
  description: "Blocks execution when too many open positions are correlated with this instrument. Placeholder: no exposure feed exists yet.",
  evaluate(context) {
    const open = context.execution?.correlatedPositions;
    const max = context.execution?.maxCorrelated;
    if (open === undefined || max === undefined) {
      return { triggered: false, skipped: true, reason: "No position/correlation exposure feed connected." };
    }
    if (open >= max) {
      return {
        triggered: true,
        reason: `${open} correlated positions are open; the limit is ${max}.`,
      };
    }
    return { triggered: false };
  },
};

export const DAILY_RISK_LIMIT_VETO: Veto = {
  code: "DAILY_RISK_LIMIT",
  label: "Daily risk limit reached",
  description: "Blocks execution once the day's realized+open risk reaches the configured ceiling. Placeholder: no daily risk tracker exists yet.",
  evaluate(context) {
    const used = context.execution?.dailyRiskUsedPercent;
    const limit = context.execution?.dailyRiskLimitPercent;
    if (used === undefined || limit === undefined) {
      return { triggered: false, skipped: true, reason: "No daily risk tracker connected." };
    }
    if (used >= limit) {
      return {
        triggered: true,
        reason: `Daily risk usage of ${used}% has reached the ${limit}% ceiling.`,
      };
    }
    return { triggered: false };
  },
};

export const MACRO_ALIGNMENT_VETO: Veto = {
  code: "MACRO_ALIGNMENT",
  label: "Macro timeframe opposes entry",
  description:
    "Blocks execution when the D1 directional context opposes the H4 trading bias.",
  evaluate(context) {
    const alignment = context.execution?.macroAlignment;
    if (alignment === undefined) {
      return {
        triggered: false,
        skipped: true,
        reason: "No macro-alignment context supplied.",
      };
    }
    if (alignment === "OPPOSED") {
      return {
        triggered: true,
        reason: `D1 macro direction ${context.execution?.macroDirection ?? "UNKNOWN"} opposes the H4 entry direction.`,
      };
    }
    return { triggered: false };
  },
};

export const REGIME_COMPATIBILITY_VETO: Veto = {
  code: "REGIME_COMPATIBILITY",
  label: "Regime incompatible with entry",
  description:
    "Blocks execution when the H4 market regime is not compatible with the directional trend/pullback strategy.",
  evaluate(context) {
    const compatible = context.execution?.regimeCompatible;
    if (compatible === undefined) {
      return {
        triggered: false,
        skipped: true,
        reason: "No regime-compatibility context supplied.",
      };
    }
    if (!compatible) {
      return {
        triggered: true,
        reason: `H4 regime ${context.execution?.regime ?? "UNKNOWN"} is not compatible with the current directional entry.`,
      };
    }
    return { triggered: false };
  },
};

export const SIGNAL_EXPIRED_VETO: Veto = {
  code: "SIGNAL_EXPIRED",
  label: "Signal expired",
  description: "Blocks execution when the signal is older than the configured maximum age.",
  evaluate(context) {
    const maxAge = context.config.execution.maxSignalAgeMs;
    const signalAt = context.execution?.signalTimestamp;
    const now = marketTime(context);
    if (signalAt === undefined) {
      return { triggered: false, skipped: true, reason: "No signal creation time supplied." };
    }
    const age = now - signalAt;
    if (age > maxAge) {
      return {
        triggered: true,
        reason: `Signal is ${Math.round(age / 1000)}s old, exceeding the ${Math.round(maxAge / 1000)}s maximum.`,
      };
    }
    return { triggered: false };
  },
};

/**
 * The default veto registry (Section 12 spec).
 *
 * Vetoes without real data are intentionally included rather than omitted: they
 * report `skipped` so the dashboard can show "not evaluated" instead of
 * silently pretending the check passed.
 */
export const DEFAULT_VETOES: Veto[] = [
  STALE_DATA_VETO,
  RR_TOO_LOW_VETO,
  INVALID_STOP_VETO,
  RISK_TOO_HIGH_VETO,
  SPREAD_TOO_WIDE_VETO,
  NEWS_BLOCK_VETO,
  CORRELATION_LIMIT_VETO,
  DAILY_RISK_LIMIT_VETO,
  MACRO_ALIGNMENT_VETO,
  REGIME_COMPATIBILITY_VETO,
  SIGNAL_EXPIRED_VETO,
];

export interface VetoEvaluation {
  veto: Veto;
  outcome: VetoOutcome;
}

/** Evaluate every veto against a context, returning each outcome. */
export function evaluateVetoes(
  context: VetoContext,
  vetoes: Veto[] = DEFAULT_VETOES
): VetoEvaluation[] {
  return vetoes.map((veto) => ({
    veto,
    outcome: veto.evaluate(context),
  }));
}
