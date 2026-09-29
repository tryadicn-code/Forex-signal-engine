/**
 * Application shell for the Phase 4 paper-trading workstation.
 *
 * Mobile keeps the chrome intentionally quiet: brand + execution mode on top,
 * fixed bottom navigation, and no duplicate provider strip. Desktop retains the
 * fuller workstation status bar and side navigation.
 */

import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { SystemStatusBar } from "@/components/dashboard/system-status-bar";
import { Badge } from "@/components/common/badges";

export function DashboardShell({
  children,
  providerId,
  liveMarketData,
  statusLabel,
}: {
  children: React.ReactNode;
  providerId?: string;
  liveMarketData?: boolean;
  statusLabel?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b0e14] text-zinc-200">
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-zinc-800 bg-[#0b0e14]/95 px-3 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="shrink-0 text-sm leading-none text-emerald-400">
            ◈
          </span>
          <span className="hidden truncate text-xs font-semibold tracking-[0.16em] text-zinc-100 sm:inline">
            FOREX SCANNER ENGINE
          </span>
          <span className="truncate text-[10px] font-semibold tracking-[0.12em] text-zinc-100 sm:hidden">
            FOREX SCANNER ENGINE
          </span>
          <Badge
            tone={statusLabel ? "info" : liveMarketData ? "bullish" : "info"}
            glyph={statusLabel ? "◷" : liveMarketData ? "●" : "◌"}
            className="text-[9px]"
          >
            {statusLabel ??
              (liveMarketData
                ? "LIVE · " + (providerId ?? "provider").toUpperCase()
                : "MOCK DATA")}
          </Badge>
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
