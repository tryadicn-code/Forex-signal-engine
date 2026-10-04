/**
 * Presentation semantics for engine labels (Phase 3).
 *
 * PURE PRESENTATION. This maps the engine's own enum values to a display label,
 * a glyph and a tone for styling. It contains no scores, no strategy, no
 * ranking: the only ordering here is the fixed visual-attention order the spec
 * asks for, applied to states the engine already produced.
 *
 * Accessibility: every status resolves to a TEXT label plus a glyph, never to
 * color alone.
 */

import type {
  BiasLabel,
  Direction,
  ExecutionDecision,
  RegimeLabel,
  SetupState,
  SignalState,
  TriggerState,
} from "@/types/market";
import type { FreshnessStatus } from "@/types/market-data";

export type Tone =
  | "bullish"
  | "bearish"
  | "neutral"
  | "info"
  | "warning"
  | "danger"
  | "muted";

/**
 * Tone -> classes. Each pairs a text color with a subtle tint and a border so
 * the status reads as a labeled chip, not just a colored dot.
 */
export const TONE_CLASSES: Record<Tone, string> = {
  bullish: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  bearish: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  neutral: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  danger: "border-orange-500/50 bg-orange-500/15 text-orange-300",
  muted: "border-zinc-700 bg-zinc-800/60 text-zinc-500",
};

interface StateMeta {
  label: string;
  glyph: string;
  tone: Tone;
  /**
   * Fixed visual-attention rank (lower = more attention). This is the spec's
   * attention order only; it is not a strategy score and never affects the
   * engine.
   */
  order: number;
}

export const SIGNAL_STATE_META: Record<SignalState, StateMeta> = {
  EXECUTE: { label: "EXECUTE", glyph: "?", tone: "bullish", order: 0 },
  RISK_APPROVED: { label: "RISK APPROVED", glyph: "?", tone: "info", order: 1 },
  TRIGGERED: { label: "TRIGGERED", glyph: "?", tone: "info", order: 2 },
  ARMED: { label: "ARMED", glyph: "?", tone: "info", order: 3 },
  SETUP: { label: "SETUP", glyph: "?", tone: "neutral", order: 4 },
  WATCH: { label: "WATCH", glyph: "?", tone: "neutral", order: 5 },
  DISCOVERED: { label: "DISCOVERED", glyph: "�", tone: "muted", order: 6 },
  MANAGE: { label: "MANAGE", glyph: "�", tone: "neutral", order: 7 },
  BLOCKED: { label: "BLOCKED", glyph: "?", tone: "danger", order: 8 },
  INVALIDATED: { label: "INVALIDATED", glyph: "?", tone: "muted", order: 9 },
  CLOSED: { label: "CLOSED", glyph: "�", tone: "muted", order: 10 },
};

export function signalStateMeta(state: SignalState): StateMeta {
  return SIGNAL_STATE_META[state];
}

/** Terminal states stop being actionable and render as history. */
export function isTerminalState(state: SignalState | null | undefined): boolean {
  return state === "CLOSED" || state === "INVALIDATED";
}

export const DIRECTION_META: Record<Direction, { label: string; glyph: string; tone: Tone }> = {
  LONG: { label: "LONG", glyph: "?", tone: "bullish" },
  SHORT: { label: "SHORT", glyph: "?", tone: "bearish" },
  NEUTRAL: { label: "NEUTRAL", glyph: "�", tone: "neutral" },
};

export const DECISION_META: Record<ExecutionDecision, { label: string; glyph: string; tone: Tone }> = {
  EXECUTE: { label: "EXECUTE", glyph: "?", tone: "bullish" },
  WAIT: { label: "WAIT", glyph: "?", tone: "neutral" },
  BLOCKED: { label: "BLOCKED", glyph: "?", tone: "danger" },
  INVALIDATED: { label: "INVALIDATED", glyph: "?", tone: "muted" },
};

export const FRESHNESS_META: Record<FreshnessStatus, { label: string; glyph: string; tone: Tone }> = {
  FRESH: { label: "FRESH", glyph: "?", tone: "bullish" },
  DELAYED: { label: "DELAYED", glyph: "?", tone: "warning" },
  STALE: { label: "STALE", glyph: "?", tone: "danger" },
};

export const SETUP_STATE_META: Record<SetupState, { label: string; tone: Tone }> = {
  ARMED: { label: "ARMED", tone: "info" },
  SETUP: { label: "SETUP", tone: "neutral" },
  WATCH: { label: "WATCH", tone: "muted" },
  INVALIDATED: { label: "INVALIDATED", tone: "muted" },
  NONE: { label: "NONE", tone: "muted" },
};

export const TRIGGER_STATE_META: Record<TriggerState, { label: string; tone: Tone }> = {
  CONFIRMED: { label: "CONFIRMED", tone: "bullish" },
  WAITING: { label: "WAITING", tone: "neutral" },
  INVALIDATED: { label: "INVALIDATED", tone: "muted" },
};

/**
 * Regime label -> short display text. The label is the engine's own value;
 * this only controls how wide it prints in a dense table.
 */
export const REGIME_DISPLAY: Record<RegimeLabel, string> = {
  STRONG_TREND_UP: "Strong Trend Up",
  TREND_UP: "Trend Up",
  RANGE: "Range",
  TREND_DOWN: "Trend Down",
  STRONG_TREND_DOWN: "Strong Trend Down",
  BREAKOUT: "Breakout",
  HIGH_VOLATILITY: "High Volatility",
  LOW_VOLATILITY: "Low Volatility",
};

/** Regime tone follows the direction the regime implies (never color alone). */
export function regimeTone(regime: RegimeLabel | null | undefined): Tone {
  switch (regime) {
    case "STRONG_TREND_UP":
    case "TREND_UP":
      return "bullish";
    case "STRONG_TREND_DOWN":
    case "TREND_DOWN":
      return "bearish";
    case "BREAKOUT":
      return "warning";
    case "HIGH_VOLATILITY":
      return "warning";
    case "LOW_VOLATILITY":
    case "RANGE":
    default:
      return "neutral";
  }
}

export const BIAS_DISPLAY: Record<BiasLabel, string> = {
  STRONG_LONG: "Strong Long",
  LONG: "Long",
  NEUTRAL: "Neutral",
  SHORT: "Short",
  STRONG_SHORT: "Strong Short",
};

export function biasTone(label: BiasLabel | null | undefined): Tone {
  switch (label) {
    case "STRONG_LONG":
      return "bullish";
    case "LONG":
      return "bullish";
    case "STRONG_SHORT":
      return "bearish";
    case "SHORT":
      return "bearish";
    default:
      return "neutral";
  }
}

/**
 * Visual attention rank for a scanner row: the engine's own decision first, then
 * the lifecycle state. Presentation ordering only - never feeds the engine.
 */
export function rowAttentionRank(input: {
  executionDecision: ExecutionDecision | null;
  signalState: SignalState | null;
}): number {
  const decisionOrder: Record<ExecutionDecision, number> = {
    EXECUTE: 0,
    BLOCKED: 8,
    INVALIDATED: 9,
    WAIT: 6,
  };
  if (input.executionDecision) return decisionOrder[input.executionDecision];
  // L8A-G2-4: SIGNAL_STATE_META lookup can miss if signalState is not a valid
  // enum value at runtime (e.g. persisted state from an older release). Fall
  // back to the same neutral rank instead of throwing on undefined.order.
  if (input.signalState) {
    const meta = SIGNAL_STATE_META[input.signalState];
    if (meta) return meta.order;
  }
  return 11;
}

/** MTF role -> the human role name, per the strategy's timeframe contract. */
export const TIMEFRAME_ROLE_LABEL: Record<"macro" | "bias" | "setup" | "trigger", string> = {
  macro: "Context",
  bias: "Bias / Regime",
  setup: "Setup",
  trigger: "Trigger",
};
