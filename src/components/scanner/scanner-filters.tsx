/**
 * Scanner controls.
 *
 * Desktop keeps the full workstation control row. Mobile shows search + a small
 * set of high-value state chips and moves direction/freshness/sort into a
 * disclosure panel so controls do not compete with the scanner itself.
 */

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  STATE_FILTER_LABELS,
  type DirectionFilter,
  type FreshnessFilter,
  type ScannerQuery,
  type ScannerSort,
  type SortDir,
  type SortKey,
  type StateFilter,
} from "@/lib/scanner-query";

const SORT_LABELS: Record<SortKey, string> = {
  attention: "Attention",
  symbol: "Symbol",
  biasScore: "Bias score",
  setupScore: "Setup score",
  riskReward: "R:R",
  updatedAt: "Updated",
};

const MOBILE_STATE_FILTERS: StateFilter[] = [
  "ALL",
  "EXECUTE",
  "ARMED",
  "BLOCKED",
  "FAILED",
];

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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const stateChips = Object.keys(STATE_FILTER_LABELS) as StateFilter[];
  const advancedCount =
    Number(query.direction !== "ALL") +
    Number(query.freshness !== "ALL") +
    Number(sort.key !== "attention" || sort.dir !== "asc");

  return (
    <div className="border-b border-zinc-800">
      <div className="space-y-2 px-3 py-2.5 md:hidden">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search symbols</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600"
            >
              <circle cx="8.5" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="m12 12 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query.query}
              onChange={(event) =>
                onQueryChange({ ...query, query: event.target.value })
              }
              placeholder="Search pair"
              aria-label="Search symbols"
              className="h-11 w-full rounded-md border border-zinc-700 bg-[#0b0e14] pl-9 pr-3 font-mono text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40"
            />
          </label>
          <button
            type="button"
            aria-expanded={mobileFiltersOpen}
            aria-controls="mobile-scanner-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
              mobileFiltersOpen || advancedCount > 0
                ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-300"
            )}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
              <path d="M3 5h14M5.5 10h9M8 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>Filters{advancedCount > 0 ? ` ${advancedCount}` : ""}</span>
          </button>
        </div>

        <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-1 scrollbar-none">
          {MOBILE_STATE_FILTERS.map((chip) => (
            <StateChip
              key={chip}
              chip={chip}
              active={query.state === chip}
              onClick={() => onQueryChange({ ...query, state: chip })}
              mobile
            />
          ))}
          <span
            aria-live="polite"
            className="ml-auto hidden shrink-0 self-center pl-2 font-mono text-[11px] text-zinc-600 sm:inline"
          >
            {resultCount} shown
          </span>
        </div>

        {mobileFiltersOpen && (
          <div
            id="mobile-scanner-filters"
            className="grid grid-cols-2 gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2.5"
          >
            <FilterSelect
              label="Direction"
              value={query.direction}
              onChange={(value) =>
                onQueryChange({ ...query, direction: value as DirectionFilter })
              }
              options={[
                ["ALL", "All"],
                ["LONG", "Long"],
                ["SHORT", "Short"],
                ["NEUTRAL", "Neutral"],
              ]}
            />
            <FilterSelect
              label="Freshness"
              value={query.freshness}
              onChange={(value) =>
                onQueryChange({ ...query, freshness: value as FreshnessFilter })
              }
              options={[
                ["ALL", "All"],
                ["FRESH", "Fresh"],
                ["DELAYED", "Delayed"],
                ["STALE", "Stale"],
              ]}
            />
            <FilterSelect
              label="Sort"
              value={sort.key}
              onChange={(value) =>
                onSortChange({ ...sort, key: value as SortKey })
              }
              options={Object.entries(SORT_LABELS)}
            />
            <FilterSelect
              label="Order"
              value={sort.dir}
              onChange={(value) =>
                onSortChange({ ...sort, dir: value as SortDir })
              }
              options={[
                ["asc", "Ascending"],
                ["desc", "Descending"],
              ]}
            />
            <button
              type="button"
              onClick={() => {
                onClear();
                setMobileFiltersOpen(false);
              }}
              className="col-span-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      <div className="hidden flex-col gap-2 px-3 py-2.5 md:flex">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Search symbols</span>
            <input
              type="search"
              value={query.query}
              onChange={(event) =>
                onQueryChange({ ...query, query: event.target.value })
              }
              placeholder="Search symbol…"
              aria-label="Search symbols"
              className="w-40 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40"
            />
          </label>

          <select
            aria-label="Filter by direction"
            value={query.direction}
            onChange={(event) =>
              onQueryChange({
                ...query,
                direction: event.target.value as DirectionFilter,
              })
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
              onQueryChange({
                ...query,
                freshness: event.target.value as FreshnessFilter,
              })
            }
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-600"
          >
            <option value="ALL">Freshness: all</option>
            <option value="FRESH">FRESH</option>
            <option value="DELAYED">DELAYED</option>
            <option value="STALE">STALE</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
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
                onSortChange({
                  ...sort,
                  dir: (sort.dir === "asc" ? "desc" : "asc") as SortDir,
                })
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
          {stateChips.map((chip) => (
            <StateChip
              key={chip}
              chip={chip}
              active={query.state === chip}
              onClick={() => onQueryChange({ ...query, state: chip })}
            />
          ))}
          <span
            className="ml-auto font-mono text-[11px] text-zinc-600"
            aria-live="polite"
            title="Rows visible after filters"
          >
            {resultCount} shown
          </span>
        </div>
      </div>
    </div>
  );
}

function StateChip({
  chip,
  active,
  onClick,
  mobile = false,
}: {
  chip: StateFilter;
  active: boolean;
  onClick: () => void;
  mobile?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border font-mono font-medium uppercase tracking-[0.08em] transition-colors",
        mobile ? "h-11 min-h-[44px] px-3 text-[11px]" : "px-2 py-0.5 text-[11px]",
        active
          ? "border-emerald-600/60 bg-emerald-600/15 text-emerald-300"
          : "border-zinc-700 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
      )}
    >
      {STATE_FILTER_LABELS[chip]}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-600"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
