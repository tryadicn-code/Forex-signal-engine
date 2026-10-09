import Link from "next/link";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Badge, ProviderStateBadge } from "@/components/common/badges";

export function DashboardShell({
  children,
  providerId,
  liveMarketData,
  providerState,
  statusLabel,
  releaseLabel,
  releaseBlocked,
}: {
  children: React.ReactNode;
  providerId?: string;
  liveMarketData?: boolean;
  providerState?: "CONNECTED" | "DEGRADED" | "DISCONNECTED" | null;
  statusLabel?: string;
  releaseLabel?: string;
  releaseBlocked?: boolean;
}) {
  const strategyLabel = releaseLabel
    ? releaseLabel.replace(/^STRAT\s*·\s*/i, "")
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0e14] text-zinc-200">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-zinc-800 bg-[#0b0e14]/95 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/#overview"
            aria-label="Forex Signal Engine dashboard"
            className="truncate text-sm font-semibold tracking-wide text-zinc-100 sm:text-base"
          >
            FOREX SIGNAL ENGINE
          </Link>

          {statusLabel && (
            <Badge tone="info" glyph="◷" className="hidden text-[11px] sm:inline-flex">
              {statusLabel}
            </Badge>
          )}

          {strategyLabel && !statusLabel && (
            <Badge
              tone={releaseBlocked ? "danger" : strategyLabel === "UNVERSIONED" ? "muted" : "info"}
              glyph={releaseBlocked ? "!" : strategyLabel === "UNVERSIONED" ? "\u25CB" : "\u25C6"}
              className="hidden text-[11px] md:inline-flex"
            >
              {strategyLabel}
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {providerId && liveMarketData && (
            <span className="hidden font-mono text-[11px] text-zinc-600 sm:inline">
              {providerId.toUpperCase()}
            </span>
          )}
          {providerState && <ProviderStateBadge state={providerState} />}
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <div className="md:border-r md:border-zinc-800">
          <SidebarNav />
        </div>
        <main className="min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      </div>

    </div>
  );
}
