/**
 * Application shell: top bar, navigation, main workspace.
 *
 * Server component. The chrome is static; the live provider strip is a server
 * component too, so the first paint carries real scanner health.
 */

import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { SystemStatusBar } from "@/components/dashboard/system-status-bar";
import { Badge } from "@/components/common/badges";
import { systemConfig } from "@/config/system";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0b0e14] text-zinc-200">
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-zinc-800 bg-[#0b0e14]/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-base leading-none text-emerald-400">
            ◈
          </span>
          <span className="text-sm font-semibold tracking-[0.18em] text-zinc-100">
            FOREX SIGNAL ENGINE
          </span>
          <Badge tone="warning" glyph="◷" className="hidden sm:inline-flex">
            {systemConfig.executionMode}
          </Badge>
        </div>
        <SystemStatusBar />
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <div className="border-b border-zinc-800 md:border-b-0 md:border-r">
          <SidebarNav />
        </div>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
