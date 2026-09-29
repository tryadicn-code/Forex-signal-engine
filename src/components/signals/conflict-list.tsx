/**
 * Engine conflict list.
 *
 * Phase 1 surfaces the evidence that argues AGAINST its own conclusion; this
 * renders it separately and prominently, so the counter-case is always visible
 * next to the bull case.
 */

import type { Conflict } from "@/types/engine";
import { formatScore } from "@/lib/format";

export function ConflictList({
  conflicts,
  emptyLabel = "No conflicts recorded",
}: {
  conflicts: Conflict[];
  emptyLabel?: string;
}) {
  if (conflicts.length === 0) {
    return <p className="text-xs text-zinc-600">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {conflicts.map((item, index) => (
        <li
          key={`${item.code}-${index}`}
          className="flex gap-2 rounded border border-amber-700/40 bg-amber-950/20 px-2.5 py-2"
        >
          <span aria-hidden="true" className="mt-0.5 text-[11px] text-amber-400">
            −
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-medium text-amber-200/90">{item.label}</span>
              {item.weight !== undefined && (
                <span
                  className="font-mono text-[10px] text-amber-600/80"
                  title="Engine-assigned weight (0-100)"
                >
                  w {formatScore(item.weight)}
                </span>
              )}
              <code className="ml-auto hidden font-mono text-[10px] text-amber-700/70 sm:inline">{item.code}</code>
            </div>
            {item.description && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/60">
                {item.description}
              </p>
            )}
            {item.value !== undefined && (
              <p className="mt-0.5 hidden font-mono text-[11px] text-amber-200/70 sm:block">
                {String(item.value)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
