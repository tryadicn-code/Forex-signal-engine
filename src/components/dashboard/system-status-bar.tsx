/**
 * Top-bar system status strip.
 *
 * Server component: reads already-computed scanner health. It never runs an
 * analysis and never constructs a provider - scanner-access is the only wiring.
 */

import { readDashboard } from "@/server/scanner-access";
import { ProviderStateBadge } from "@/components/common/badges";
import { formatTime, formatDuration } from "@/lib/format";

export async function SystemStatusBar() {
  const { health, releaseRuntime } = await readDashboard();
  const providerState = health?.providerStatus?.state ?? null;
  const lastScan = health?.lastScanCompletedAt ?? null;
  const failed = health?.symbolsFailed ?? 0;

  return (
    <div className="flex items-center gap-3">
      <div className="hidden items-center gap-1.5 sm:flex">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Provider
        </span>
        <ProviderStateBadge state={providerState} />
      </div>
      <div className="hidden items-center gap-1.5 md:flex">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Last scan
        </span>
        <span className="font-mono text-xs text-zinc-300">{formatTime(lastScan)}</span>
      </div>
      <div className="hidden items-center gap-1.5 md:flex">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Scan time
        </span>
        <span className="font-mono text-xs text-zinc-300">{formatDuration(health?.durationMs)}</span>
      </div>
      <div className="hidden items-center gap-1.5 xl:flex">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Strategy
        </span>
        <span
          className={
            "font-mono text-xs " +
            (releaseRuntime?.status === "BLOCKED"
              ? "text-red-300"
              : releaseRuntime?.status === "ACTIVE"
                ? "text-emerald-300"
                : "text-amber-300")
          }
        >
          {releaseRuntime?.status === "ACTIVE"
            ? releaseRuntime.version
            : releaseRuntime?.status ?? "UNVERSIONED"}
        </span>
      </div>
      {failed > 0 && (
        <span className="font-mono text-xs text-orange-300" title="Symbols that failed in the last cycle">
          {failed} failed
        </span>
      )}
    </div>
  );
}
