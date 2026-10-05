/**
 * Compact trading-workstation summary.
 *
 * Keeps only action-oriented counts and lightweight scanner metadata.
 */

import type { ScannerHealth, ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";
import type { SignalView } from "@/scanner/scanner-api";
import { formatTime } from "@/lib/format";
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
        className="min-w-0 px-2 py-2 text-center sm:px-3 transition-colors hover:bg-zinc-800/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
        aria-label={`Filter scanner by ${label}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="min-w-0 px-2 py-2 text-center sm:px-3">
      {content}
    </div>
  );
}

export function DashboardSummary({
  snapshot,
  health,
  activeSignals,
  onFilter,
}: {
  snapshot: ScannerSnapshot | null;
  health: ScannerHealth | null;
  activeSignals: SignalView[];
  /** UIUX-M-010: tap a KPI tile to jump to the scanner with that filter. */
  onFilter?: (state: StateFilter) => void;
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

      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500 sm:text-xs">
        <span><span className="font-mono text-zinc-300">{counts.scanned}</span> pairs</span>
        <span aria-hidden="true" className="text-zinc-500">·</span>
        <span><span className="font-mono text-zinc-300">{activeSignals.length}</span> active</span>
        <span aria-hidden="true" className="text-zinc-500">·</span>
        <span>Last scan <span className="font-mono tabular-nums text-zinc-300">{formatTime(health?.lastScanCompletedAt)}</span></span>
      </div>

      {counts.engineExecute > counts.ready && (
        <div className="border-t border-zinc-800 px-3 py-1.5 text-center text-[11px] text-amber-300">
          {counts.engineExecute - counts.ready} engine-ready awaiting lifecycle
        </div>
      )}
    </section>
  );
}
