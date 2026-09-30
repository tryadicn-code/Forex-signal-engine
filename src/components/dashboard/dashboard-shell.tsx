import Link from "next/link";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { SystemStatusBar } from "@/components/dashboard/system-status-bar";
import { Badge } from "@/components/common/badges";

export function DashboardShell({
  children,
  providerId,
  liveMarketData,
  statusLabel,
  releaseLabel,
  releaseBlocked,
}: {
  children: React.ReactNode;
  providerId?: string;
  liveMarketData?: boolean;
  statusLabel?: string;
  releaseLabel?: string;
  releaseBlocked?: boolean;
}) {
  const marketLabel = statusLabel
    ? statusLabel
    : liveMarketData
      ? (providerId ?? "provider").toUpperCase()
      : "MOCK";

  const strategyLabel = releaseLabel
    ? releaseLabel.replace(/^STRAT\s*·\s*/i, "")
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0e14] text-zinc-200">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-zinc-800 bg-[#0b0e14]/95 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/#overview"
            aria-label="FSE dashboard"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 font-mono text-xs font-bold text-zinc-100"
          >
            FSE
          </Link>

          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-xs font-semibold tracking-[0.12em] text-zinc-100">
              FOREX SIGNAL ENGINE
            </div>
            <div className="mt-0.5 text-[10px] text-zinc-600">
              Trading workstation
            </div>
          </div>

          <Badge
            tone={statusLabel ? "info" : liveMarketData ? "bullish" : "info"}
            glyph={statusLabel ? "◷" : liveMarketData ? "●" : "◌"}
            className="text-[9px]"
          >
            {marketLabel}
          </Badge>

          {!statusLabel && (
            <Badge tone="neutral" className="text-[9px]">
              PAPER
            </Badge>
          )}

          {strategyLabel && (
            <Badge
              tone={releaseBlocked ? "danger" : strategyLabel === "UNVERSIONED" ? "warning" : "info"}
              glyph={releaseBlocked ? "!" : strategyLabel === "UNVERSIONED" ? "!" : "◆"}
              className="hidden text-[9px] md:inline-flex"
            >
              {strategyLabel}
            </Badge>
          )}
        </div>

        <div className="hidden lg:block">
          <SystemStatusBar />
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <div className="md:border-r md:border-zinc-800">
          <SidebarNav />
        </div>
        <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
      </div>
    </div>
  );
}
