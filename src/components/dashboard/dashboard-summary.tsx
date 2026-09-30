/**
 * Trading-workstation summary.
 *
 * The first viewport intentionally exposes only four action-oriented KPIs.
 * Provider/timing diagnostics remain available in System.
 */

import type { ScannerHealth, ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";
import type { SignalView } from "@/scanner/scanner-api";
import { ProviderStateBadge } from "@/components/common/badges";
import { formatTime } from "@/lib/format";

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
}: {
  label: string;
  value: number;
  tone?: "default" | "ready" | "warn" | "danger";
}) {
  const valueClass =
    tone === "ready"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-red-300"
          : "text-zinc-100";

  return (
    <div className="min-w-0 px-2 py-2.5 sm:px-3">
      <div className="text-[11px] font-medium text-zinc-500 sm:text-xs">
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}

export function DashboardSummary({
  snapshot,
  health,
  activeSignals,
}: {
  snapshot: ScannerSnapshot | null;
  health: ScannerHealth | null;
  activeSignals: SignalView[];
}) {
  const counts = summarizeResults(snapshot?.results ?? []);

  return (
    <section
      aria-label="Actionable market summary"
      className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/25"
    >
      <div className="grid grid-cols-4 divide-x divide-zinc-800">
        <Kpi label="Ready" value={counts.ready} tone={counts.ready > 0 ? "ready" : "default"} />
        <Kpi label="Armed" value={counts.armed} tone={counts.armed > 0 ? "warn" : "default"} />
        <Kpi label="Blocked" value={counts.blocked} tone={counts.blocked > 0 ? "danger" : "default"} />
        <Kpi label="Data issues" value={counts.dataIssues} tone={counts.dataIssues > 0 ? "warn" : "default"} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
        <span>{counts.scanned} pairs</span>
        <span aria-hidden="true" className="text-zinc-700">·</span>
        <span>{activeSignals.length} active</span>
        <span aria-hidden="true" className="text-zinc-700">·</span>
        <span className="inline-flex items-center gap-1.5">
          <ProviderStateBadge state={health?.providerStatus?.state ?? null} className="text-[9px]" />
        </span>
        <span aria-hidden="true" className="text-zinc-700">·</span>
        <span className="font-mono tabular-nums">Last scan {formatTime(health?.lastScanCompletedAt)}</span>
        {counts.engineExecute > counts.ready && (
          <>
            <span aria-hidden="true" className="text-zinc-700">·</span>
            <span className="text-amber-300">
              {counts.engineExecute - counts.ready} engine-ready awaiting lifecycle
            </span>
          </>
        )}
      </div>
    </section>
  );
}
