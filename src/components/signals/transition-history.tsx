/**
 * Transition history (audit trail).
 *
 * Renders the transitions the scanner already recorded: time, previous state,
 * new state, reason. Compact, oldest first.
 */

import type { SignalStateTransition } from "@/types/market-data";
import { formatTimeShort, NOT_AVAILABLE } from "@/lib/format";

export function TransitionHistory({
  transitions,
  emptyLabel = "No transitions recorded yet",
}: {
  transitions: SignalStateTransition[];
  emptyLabel?: string;
}) {
  if (transitions.length === 0) {
    return <p className="text-xs text-zinc-600">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left font-mono text-[11px]">
        <caption className="sr-only">Signal state transitions, oldest first</caption>
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-zinc-600">
            <th scope="col" className="py-1 pr-3 font-medium">Time</th>
            <th scope="col" className="py-1 pr-3 font-medium">From</th>
            <th scope="col" className="py-1 pr-3 font-medium">To</th>
            <th scope="col" className="py-1 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody>
          {transitions.map((transition, index) => (
            <tr key={`${transition.signalId}-${index}`} className="border-t border-zinc-800/70">
              <td className="py-1 pr-3 tabular-nums text-zinc-500">
                {formatTimeShort(transition.timestamp)}
              </td>
              <td className="py-1 pr-3 text-zinc-500">
                {transition.previousState ?? NOT_AVAILABLE}
              </td>
              <td className="py-1 pr-3 text-zinc-200">{transition.newState}</td>
              <td className="py-1 text-zinc-400">{transition.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
