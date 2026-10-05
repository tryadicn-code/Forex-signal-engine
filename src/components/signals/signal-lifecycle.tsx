/**
 * Signal lifecycle visualization.
 *
 * Renders the engine's own state sequence as a stepper and shows safety or
 * terminal states separately. The UI adds no lifecycle states of its own.
 */

import type { SignalState } from "@/types/market";
import { cn } from "@/lib/utils";

const PROGRESSION: SignalState[] = [
  "DISCOVERED",
  "WATCH",
  "SETUP",
  "ARMED",
  "TRIGGERED",
  "RISK_APPROVED",
  "EXECUTE",
];

const TERMINAL_STATES: SignalState[] = ["BLOCKED", "INVALIDATED", "CLOSED"];

export function SignalLifecycle({ state }: { state: SignalState | null }) {
  if (!state) {
    return <p className="text-xs text-zinc-600">No signal lifecycle for this symbol.</p>;
  }

  if (state === "MANAGE") {
    return (
      <div
        role="status"
        className="rounded border border-sky-700/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-200"
      >
        <span className="font-mono font-semibold uppercase tracking-wide">MANAGE</span>
        <p className="mt-0.5 text-[11px] text-sky-200/60">
          The engine reports an existing management state. Phase 3 only displays it;
          no broker or trade-management action is performed here.
        </p>
      </div>
    );
  }

  if (TERMINAL_STATES.includes(state)) {
    return (
      <div
        role="status"
        className={cn(
          "rounded border px-3 py-2 text-xs",
          state === "BLOCKED"
            ? "border-orange-700/50 bg-orange-950/20 text-orange-200"
            : "border-zinc-700 bg-zinc-900/40 text-zinc-300"
        )}
      >
        <span className="font-mono font-semibold uppercase tracking-wide">{state}</span>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {state === "BLOCKED"
            ? "Execution is blocked. The block reasons below are the engine's own."
            : state === "INVALIDATED"
              ? "The setup was invalidated and is no longer actionable."
              : "The signal reached the end of its lifecycle."}
        </p>
      </div>
    );
  }

  const currentIndex = PROGRESSION.indexOf(state);

  return (
    <ol className="flex flex-wrap items-center gap-1">
      {PROGRESSION.map((step, index) => {
        const reached = index <= currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                isCurrent
                  ? "border-emerald-600/70 bg-emerald-600/15 text-emerald-300"
                  : reached
                    ? "border-zinc-600 bg-zinc-800/60 text-zinc-300"
                    : "border-zinc-800 text-zinc-600"
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {step}
            </span>
            {index < PROGRESSION.length - 1 && (
              <span aria-hidden="true" className="text-[10px] text-zinc-500">
                →
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
