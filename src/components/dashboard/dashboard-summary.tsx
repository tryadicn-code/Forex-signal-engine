/**
 * Compact trading-workstation summary.
 *
 * Keeps only action-oriented counts and lightweight scanner metadata.
 */

import type { ScannerHealth, ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";
import { formatTimeShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StateFilter } from "@/lib/scanner-query";

export function summarizeResults(results: SymbolScanResult[]) {
  return {
    scanned: results.length,
    ready: results.filter(
      (result) =>
        result.executionDecision === "EXECUTE" &&
        result.signalState === "EXECUTE"
    ).length,
    engineExecute: results.filter(
      (result) => result.executionDecision === "EXECUTE"
    ).length,
    blocked: results.filter(
      (result) =>
        result.executionDecision === "BLOCKED" ||
        result.signalState === "BLOCKED"
    ).length,
    armed: results.filter(
      (result) =>
        result.setupState === "ARMED" ||
        result.signalState === "ARMED"
    ).length,
    dataIssues: results.filter(
      (result) =>
        result.status !== "ANALYSED" ||
        result.freshness === "DELAYED" ||
        result.freshness === "STALE"
    ).length,
  };
}

function Kpi({
  label,
  value,
  tone = "default",
  onClick,
}: {
  label: string;
  value: number;
  tone?: "default" | "ready" | "warn" | "danger";
  /** UIUX-M-010: when provided, the whole tile becomes a button. */
  onClick?: () => void;
}) {
  const valueClass =
    tone === "ready"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-red-300"
          : "text-zinc-100";

  const content = (
    <>
      <div className="truncate text-[11px] font-medium text-zinc-500 sm:text-[11px]">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-lg font-semibold tabular-nums sm:text-xl ${valueClass}`}>
        {value}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 px-2.5 py-2 text-center transition-colors hover:bg-zinc-800/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        aria-label={`Filter scanner by ${label}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="min-w-0 px-2.5 py-2 text-center">
      {content}
    </div>
  );
}

export function DashboardSummary({
  snapshot,
  health,
  onFilter,
  liveMarketData,
  providerId,
  onRefresh,
  refreshing,
}: {
  snapshot: ScannerSnapshot | null;
  health: ScannerHealth | null;
  /** UIUX-M-010: tap a KPI tile to jump to the scanner with that filter. */
  onFilter?: (state: StateFilter) => void;
  /** UIUX-M: provider identity + live flag for the footer meta row. */
  liveMarketData?: boolean;
  providerId?: string | null;
  /** UIUX-M: refresh control owned by the parent workspace. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const counts = summarizeResults(snapshot?.results ?? []);

  return (
    <section
      aria-label="Actionable market summary"
      className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/20"
    >
      <div className="grid grid-cols-4 divide-x divide-zinc-800">
        <Kpi
          label="Ready"
          value={counts.ready}
          tone={counts.ready > 0 ? "ready" : "default"}
          onClick={onFilter ? () => onFilter("EXECUTE") : undefined}
        />
        <Kpi
          label="Armed"
          value={counts.armed}
          tone={counts.armed > 0 ? "warn" : "default"}
          onClick={onFilter ? () => onFilter("ARMED") : undefined}
        />
        <Kpi
          label="Blocked"
          value={counts.blocked}
          tone={counts.blocked > 0 ? "danger" : "default"}
          onClick={onFilter ? () => onFilter("BLOCKED") : undefined}
        />
        <Kpi
          label="Issues"
          value={counts.dataIssues}
          tone={counts.dataIssues > 0 ? "warn" : "default"}
          onClick={onFilter ? () => onFilter("FAILED") : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500 sm:text-xs">
        <span className={cn("font-mono text-[10px] uppercase tracking-wide", liveMarketData ? "text-emerald-400" : "text-zinc-600")}>
          {liveMarketData ? "[LIVE]" : "[MOCK]"}
        </span>
        <span className="font-mono text-zinc-300">
          {(providerId ?? "unknown").toUpperCase()}
        </span>
        <span aria-hidden="true" className="text-zinc-600">{"\u00B7"}</span>
        <span>
          <span className="font-mono text-zinc-300">{counts.scanned}</span> pairs
        </span>
        <span aria-hidden="true" className="text-zinc-600">{"\u00B7"}</span>
        <span>
          Last scan <span className="font-mono tabular-nums text-zinc-300">{formatTimeShort(health?.lastScanCompletedAt)}{" WITA"}</span>
        </span>
        <span aria-hidden="true" className="text-zinc-600">{"\u00B7"}</span>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh scan"
            className="inline-flex items-center gap-1 transition-colors hover:text-zinc-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <span>Sync</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className={cn("h-3 w-3 text-zinc-300", refreshing && "animate-spin")}
            >
              <path d="M16 4v4h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15.5 11a6 6 0 1 1-1.3-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {counts.engineExecute > counts.ready && (
        <div className="border-t border-zinc-800 px-3 py-1.5 text-center text-[11px] text-amber-300">
          {counts.engineExecute - counts.ready} engine-ready awaiting lifecycle
        </div>
      )}
    </section>
  );
}
