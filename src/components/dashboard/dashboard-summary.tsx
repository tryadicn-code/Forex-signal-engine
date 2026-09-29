/**
 * Dashboard summary tiles.
 *
 * Mobile prioritises the six operational counts a trader needs at a glance.
 * Provider and timing diagnostics remain available below in Market Data Health
 * and reappear as summary tiles on larger screens.
 */

import type { ScannerHealth, ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";
import type { SignalView } from "@/scanner/scanner-api";
import { ProviderStateBadge } from "@/components/common/badges";
import { NOT_AVAILABLE, formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function SummaryTile({
  label,
  value,
  glyph,
  tone,
  note,
  className,
}: {
  label: string;
  value: React.ReactNode;
  glyph: string;
  tone?: "default" | "warn" | "danger" | "good";
  note?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border border-zinc-800 bg-zinc-900/35 px-3 py-2.5",
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        <span aria-hidden="true" className="text-zinc-600">
          {glyph}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "mt-1.5 font-mono text-xl font-semibold leading-none tabular-nums sm:text-lg",
          tone === "warn" && "text-amber-300",
          tone === "danger" && "text-orange-300",
          tone === "good" && "text-emerald-300",
          (!tone || tone === "default") && "text-zinc-100"
        )}
      >
        {value}
      </div>
      {note && (
        <div className="mt-1 hidden truncate text-[10px] text-zinc-600 sm:block">
          {note}
        </div>
      )}
    </div>
  );
}

export function summarizeResults(results: SymbolScanResult[]) {
  return {
    scanned: results.length,
    executable: results.filter(
      (r) => r.executionDecision === "EXECUTE" && r.signalState === "EXECUTE"
    ).length,
    engineExecute: results.filter((r) => r.executionDecision === "EXECUTE").length,
    blocked: results.filter((r) => r.executionDecision === "BLOCKED").length,
    armed: results.filter(
      (r) => r.setupState === "ARMED" || r.signalState === "ARMED"
    ).length,
    stale: results.filter((r) => r.freshness === "STALE").length,
    failed: results.filter((r) => r.status !== "ANALYSED").length,
    triggered: results.filter((r) => r.signalState === "TRIGGERED").length,
  };
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
    <section aria-label="Scanner summary">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <SummaryTile glyph="◉" label="Pairs" value={counts.scanned} />
        <SummaryTile
          glyph="⚡"
          label="Active"
          value={activeSignals.length}
          note={health ? health.activeSignals + " tracked" : undefined}
          tone={activeSignals.length > 0 ? "good" : "default"}
        />
        <SummaryTile glyph="◉" label="Armed" value={counts.armed} />
        <SummaryTile
          glyph="▶"
          label="Executable"
          value={counts.executable}
          tone={counts.executable > 0 ? "good" : "default"}
          note={
            counts.engineExecute > counts.executable
              ? counts.engineExecute + " engine execute · " + counts.executable + " actionable"
              : undefined
          }
        />
        <SummaryTile
          glyph="✕"
          label="Blocked"
          value={counts.blocked}
          tone={counts.blocked > 0 ? "danger" : "default"}
        />
        <SummaryTile
          glyph="◷"
          label="Stale / failed"
          value={counts.stale + counts.failed}
          note={counts.stale + counts.failed > 0 ? "execution data-gated" : undefined}
          tone={counts.stale + counts.failed > 0 ? "warn" : "default"}
        />
        <SummaryTile
          glyph="◈"
          label="Provider"
          value={<ProviderStateBadge state={health?.providerStatus?.state ?? null} />}
          className="hidden xl:block"
        />
        <SummaryTile
          glyph="◷"
          label="Last scan"
          value={<span className="text-sm">{formatTime(health?.lastScanCompletedAt)}</span>}
          note={
            health
              ? "Duration " +
                formatDuration(health.durationMs) +
                " · " +
                health.symbolsSuccessful +
                " ok / " +
                health.symbolsFailed +
                " failed"
              : undefined
          }
          className="hidden xl:block"
        />
      </div>
      {snapshot === null && (
        <p className="mt-2 text-xs text-zinc-600">
          {NOT_AVAILABLE} No scan has completed yet.
        </p>
      )}
    </section>
  );
}
