/**
 * Scanner empty / unavailable states.
 *
 * One component, one explicit message per situation, so the dashboard never
 * shows a blank table with no explanation.
 */

import { cn } from "@/lib/utils";

export type EmptyKind =
  | "no-scan"
  | "no-results"
  | "no-matches"
  | "scan-error";

const COPY: Record<EmptyKind, { glyph: string; title: string; body: string; tone: string }> = {
  "no-scan": {
    glyph: "◌",
    title: "No scan yet",
    body: "The scanner has not completed a cycle. Use Refresh to run the first analysis.",
    tone: "text-zinc-400",
  },
  "no-results": {
    glyph: "◌",
    title: "No symbols scanned",
    body: "The configured universe produced no results. Check the scanner configuration.",
    tone: "text-zinc-400",
  },
  "no-matches": {
    glyph: "⌕",
    title: "No matching symbols",
    body: "No rows match the current search and filters. Clear them to see the full universe.",
    tone: "text-zinc-400",
  },
  "scan-error": {
    glyph: "✕",
    title: "Scanner unavailable",
    body: "The last scan cycle failed before results could be produced.",
    tone: "text-orange-300",
  },
};

export function ScannerEmptyState({
  kind,
  detail,
  onClearFilters,
  onRefresh,
}: {
  kind: EmptyKind;
  detail?: string | null;
  onClearFilters?: () => void;
  onRefresh?: () => void;
}) {
  const copy = COPY[kind];
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 px-6 py-12 text-center")}
    >
      <span aria-hidden="true" className={cn("text-2xl", copy.tone)}>
        {copy.glyph}
      </span>
      <h3 className="text-sm font-semibold text-zinc-200">{copy.title}</h3>
      <p className="max-w-md text-xs text-zinc-500">{copy.body}</p>
      {detail && (
        <p className="max-w-md break-words font-mono text-[11px] text-orange-300/90">{detail}</p>
      )}
      <div className="mt-2 flex gap-2">
        {kind === "no-matches" && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Clear filters
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
