/**
 * Scanner controls: search, state chips, direction / freshness selects, sort.
 *
 * Pure UI state - every value is a prop, every change is a callback. No data is
 * fetched or derived here.
 */

"use client";

import { cn } from "@/lib/utils";
import {
  STATE_FILTER_LABELS,
  type DirectionFilter,
  type FreshnessFilter,
  type ScannerQuery,
  type ScannerSort,
  type SortDir,
  type SortKey,
} from "@/lib/scanner-query";

const SORT_LABELS: Record<SortKey, string> = {
  attention: "Attention",
  symbol: "Symbol",
  biasScore: "Bias score",
  setupScore: "Setup score",
  riskReward: "R:R",
  updatedAt: "Updated",
};

export function ScannerFilters({
  query,
  sort,
  resultCount,
  onQueryChange,
  onSortChange,
  onClear,
}: {
  query: ScannerQuery;
  sort: ScannerSort;
  resultCount: number;
  onQueryChange: (query: ScannerQuery) => void;
  onSortChange: (sort: ScannerSort) => void;
  onClear: () => void;
}) {
  const stateChips = Object.keys(STATE_FILTER_LABELS) as Array<keyof typeof STATE_FILTER_LABELS>;

  return (
    <div className="flex flex-col gap-2 border-b border-zinc-800 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Search symbols</span>
          <input
            type="search"
            value={query.query}
            onChange={(event) => onQueryChange({ ...query, query: event.target.value })}
            placeholder="Search symbol…"
            aria-label="Search symbols"
            className="w-32 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40 sm:w-40"
          />
        </label>

        <select
          aria-label="Filter by direction"
          value={query.direction}
          onChange={(event) =>
            onQueryChange({ ...query, direction: event.target.value as DirectionFilter })
          }
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-600"
        >
          <option value="ALL">Direction: all</option>
          <option value="LONG">LONG</option>
          <option value="SHORT">SHORT</option>
          <option value="NEUTRAL">NEUTRAL</option>
        </select>

        <select
          aria-label="Filter by freshness"
          value={query.freshness}
          onChange={(event) =>
            onQueryChange({ ...query, freshness: event.target.value as FreshnessFilter })
          }
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-600"
        >
          <option value="ALL">Freshness: all</option>
          <option value="FRESH">FRESH</option>
          <option value="DELAYED">DELAYED</option>
          <option value="STALE">STALE</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
            Sort
            <select
              aria-label="Sort by"
              value={sort.key}
              onChange={(event) =>
                onSortChange({ ...sort, key: event.target.value as SortKey })
              }
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-600"
            >
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-label={`Sort ${sort.dir === "asc" ? "ascending" : "descending"}`}
            onClick={() =>
              onSortChange({ ...sort, dir: (sort.dir === "asc" ? "desc" : "asc") as SortDir })
            }
            className="rounded border border-zinc-700 px-2 py-1 font-mono text-xs text-zinc-300 hover:bg-zinc-800"
          >
            {sort.dir === "asc" ? "▲" : "▼"}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {stateChips.map((chip) => {
          const active = query.state === chip;
          return (
            <button
              key={chip}
              type="button"
              aria-pressed={active}
              onClick={() => onQueryChange({ ...query, state: chip })}
              className={cn(
                "rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors",
                active
                  ? "border-emerald-600/60 bg-emerald-600/15 text-emerald-300"
                  : "border-zinc-700 text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
              )}
            >
              {STATE_FILTER_LABELS[chip]}
            </button>
          );
        })}
        <span
          className="ml-auto font-mono text-[10px] text-zinc-600"
          aria-live="polite"
          title="Rows visible after filters"
        >
          {resultCount} shown
        </span>
      </div>
    </div>
  );
}
