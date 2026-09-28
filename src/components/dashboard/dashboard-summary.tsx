/**
 * Dashboard summary tiles.
 *
 * Every number is derived from scanner output that already exists: counts over
 * the last snapshot's results plus the scanner's own health record. No metric
 * is invented, and every tile falls back to an explicit placeholder when a scan
 * has not produced a value yet.
 */

import type { ScannerHealth, ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";
import type { SignalView } from "@/scanner/scanner-api";
import { Badge, ProviderStateBadge } from "@/components/common/badges";
import { NOT_AVAILABLE, formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function SummaryTile({
  label,
  value,
  glyph,
  tone,
  note,
}: {
  label: string;
  value: React.ReactNode;
  glyph: string;
  tone?: "default" | "warn" | "danger" | "good";
  note?: string;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        <span aria-hidden="true" className="text-zinc-600">
          {glyph}
        </span>
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          tone === "warn" && "text-amber-300",
          tone === "danger" && "text-orange-300",
          tone === "good" && "text-emerald-300",
          (!tone || tone === "default") && "text-zinc-100"
        )}
      >
        {value}
      </div>
      {note && <div className="mt-0.5 text-[10px] text-zinc-600">{note}</div>}
    </div>
  );
}

/** Counts the UI labels over the last scan's results. Presentation only. */
export function summarizeResults(results: SymbolScanResult[]) {
  return {
    scanned: results.length,
    executable: results.filter((r) => r.executionDecision === "EXECUTE").length,
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
        <SummaryTile glyph="◉" label="Pairs scanned" value={counts.scanned} />
        <SummaryTile
          glyph="⚡"
          label="Active signals"
          value={activeSignals.length}
          note={health ? health.activeSignals + " tracked" : undefined}
          tone={activeSignals.length > 0 ? "good" : "default"}
        />
        <SummaryTile glyph="◉" label="Armed setups" value={counts.armed} />
        <SummaryTile
          glyph="▶"
          label="Executable"
          value={counts.executable}
          tone={counts.executable > 0 ? "good" : "default"}
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
        />
        <SummaryTile
          glyph="◷"
          label="Last scan"
          value={<span className="text-sm">{formatTime(health?.lastScanCompletedAt)}</span>}
          note={
            health
              ? `Duration ${formatDuration(health.durationMs)} · ${health.symbolsSuccessful} ok / ${health.symbolsFailed} failed`
              : undefined
          }
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
