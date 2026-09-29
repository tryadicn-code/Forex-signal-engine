/**
 * Status badges.
 *
 * Every badge renders a TEXT LABEL and a glyph together with its tone, so a
 * status is never communicated by color alone. All values come from the
 * engine's own enums; badges never compute or reinterpret a result.
 */

import { cn } from "@/lib/utils";
import {
  TONE_CLASSES,
  type Tone,
  BIAS_DISPLAY,
  biasTone,
  DECISION_META,
  DIRECTION_META,
  FRESHNESS_META,
  REGIME_DISPLAY,
  regimeTone,
  SETUP_STATE_META,
  SIGNAL_STATE_META,
  TRIGGER_STATE_META,
} from "@/lib/signal-meta";
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
import { NOT_AVAILABLE } from "@/lib/format";

export function Badge({
  tone,
  glyph,
  children,
  className,
  title,
}: {
  tone: Tone;
  glyph?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5",
        "font-mono text-[10px] font-semibold uppercase tracking-wide",
        TONE_CLASSES[tone],
        className
      )}
      title={title}
    >
      {glyph && <span aria-hidden="true">{glyph}</span>}
      {children}
    </span>
  );
}

export function StateBadge({ state, className }: { state: SignalState | null | undefined; className?: string }) {
  if (!state) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  const meta = SIGNAL_STATE_META[state];
  return (
    <Badge tone={meta.tone} glyph={meta.glyph} className={className} title={`Signal state: ${state}`}>
      {meta.label}
    </Badge>
  );
}

export function DecisionBadge({
  decision,
  className,
}: {
  decision: ExecutionDecision | null | undefined;
  className?: string;
}) {
  if (!decision) {
    return <Badge tone="muted" className={className}>Not evaluated</Badge>;
  }
  const meta = DECISION_META[decision];
  return (
    <Badge
      tone={meta.tone}
      glyph={meta.glyph}
      className={className}
      title={
        decision === "EXECUTE"
          ? "Engine decision: EXECUTE. Paper Trading processes this automatically after a scanner refresh."
          : `Execution decision: ${decision}`
      }
    >
      {meta.label}
    </Badge>
  );
}

export function DirectionBadge({
  direction,
  className,
}: {
  direction: Direction | null | undefined;
  className?: string;
}) {
  if (!direction) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  const meta = DIRECTION_META[direction];
  return (
    <Badge tone={meta.tone} glyph={meta.glyph} className={className} title={`Direction: ${direction}`}>
      {meta.label}
    </Badge>
  );
}

export function FreshnessBadge({
  status,
  className,
}: {
  status: FreshnessStatus | null | undefined;
  className?: string;
}) {
  if (!status) {
    return <Badge tone="muted" className={className}>No data</Badge>;
  }
  const meta = FRESHNESS_META[status];
  return (
    <Badge tone={meta.tone} glyph={meta.glyph} className={className} title={`Data freshness: ${status}`}>
      {meta.label}
    </Badge>
  );
}

export function BiasBadge({ bias, className }: { bias: BiasLabel | null | undefined; className?: string }) {
  if (!bias) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  return (
    <Badge tone={biasTone(bias)} className={className} title={`Bias: ${bias}`}>
      {BIAS_DISPLAY[bias]}
    </Badge>
  );
}

export function RegimeBadge({ regime, className }: { regime: RegimeLabel | null | undefined; className?: string }) {
  if (!regime) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  return (
    <Badge tone={regimeTone(regime)} className={className} title={`Regime: ${regime}`}>
      {REGIME_DISPLAY[regime]}
    </Badge>
  );
}

export function SetupStateBadge({
  state,
  className,
}: {
  state: SetupState | null | undefined;
  className?: string;
}) {
  if (!state) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  const meta = SETUP_STATE_META[state];
  return (
    <Badge tone={meta.tone} className={className} title={`Setup state: ${state}`}>
      {meta.label}
    </Badge>
  );
}

export function TriggerStateBadge({
  state,
  className,
}: {
  state: TriggerState | null | undefined;
  className?: string;
}) {
  if (!state) {
    return <Badge tone="muted" className={className}>Not evaluated</Badge>;
  }
  const meta = TRIGGER_STATE_META[state];
  return (
    <Badge tone={meta.tone} className={className} title={`Trigger state: ${state}`}>
      {meta.label}
    </Badge>
  );
}

/** Provider connection state, with an explicit glyph for the state. */
export function ProviderStateBadge({
  state,
  className,
}: {
  state: "CONNECTED" | "DEGRADED" | "DISCONNECTED" | null | undefined;
  className?: string;
}) {
  if (state === "CONNECTED") {
    return <Badge tone="bullish" glyph="●" className={className}>Connected</Badge>;
  }
  if (state === "DEGRADED") {
    return <Badge tone="warning" glyph="◔" className={className}>Degraded</Badge>;
  }
  if (state === "DISCONNECTED") {
    return <Badge tone="danger" glyph="✕" className={className}>Disconnected</Badge>;
  }
  return <Badge tone="muted" glyph="◌" className={className}>No provider</Badge>;
}
