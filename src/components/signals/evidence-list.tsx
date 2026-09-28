/**
 * Engine evidence list.
 *
 * Renders the structured evidence the engines already returned. The UI never
 * generates an explanation and never re-weights anything: weights shown are the
 * engine's own values.
 */

import type { Evidence } from "@/types/engine";
import { formatScore } from "@/lib/format";

export function EvidenceList({
  evidence,
  emptyLabel = "No evidence recorded",
}: {
  evidence: Evidence[];
  emptyLabel?: string;
}) {
  if (evidence.length === 0) {
    return <p className="text-xs text-zinc-600">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {evidence.map((item, index) => (
        <li
          key={`${item.code}-${index}`}
          className="flex gap-2 rounded border border-zinc-800/70 bg-zinc-900/30 px-2 py-1.5"
        >
          <span aria-hidden="true" className="mt-0.5 text-[11px] text-emerald-400">
            +
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-medium text-zinc-200">{item.label}</span>
              {item.weight !== undefined && (
                <span
                  className="font-mono text-[10px] text-zinc-500"
                  title="Engine-assigned weight (0-100)"
                >
                  w {formatScore(item.weight)}
                </span>
              )}
              <code className="ml-auto font-mono text-[10px] text-zinc-600">{item.code}</code>
            </div>
            {item.description && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                {item.description}
              </p>
            )}
            {item.value !== undefined && (
              <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                {String(item.value)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
