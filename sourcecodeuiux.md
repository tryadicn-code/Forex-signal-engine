PS C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)> Set-Location "C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)"
PS C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)>
PS C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)> $files = @(
>>   # Design system
>>   "src\app\globals.css",
>>   "tailwind.config.ts",
>>   "tailwind.config.js",
>>   "postcss.config.js",
>>   "postcss.config.mjs",
>>
>>   # Shell & Navigation
>>   "src\components\dashboard\dashboard-shell.tsx",
>>   "src\components\dashboard\sidebar-nav.tsx",
>>   "src\components\dashboard\system-status-bar.tsx",
>>
>>   # Dashboard panels
>>   "src\components\dashboard\dashboard-summary.tsx",
>>   "src\components\dashboard\market-health-panel.tsx",
>>
>>   # Signals
>>   "src\components\signals\signal-detail-panel.tsx",
>>   "src\components\signals\signal-executive-summary.tsx",
>>   "src\components\signals\signal-lifecycle.tsx",
>>   "src\components\signals\evidence-list.tsx",
>>   "src\components\signals\conflict-list.tsx",
>>   "src\components\signals\mtf-context.tsx",
>>   "src\components\signals\transition-history.tsx",
>>   "src\components\signals\price-chart.tsx",
>>
>>   # Scanner
>>   "src\components\scanner\scanner-table.tsx",
>>   "src\components\scanner\scanner-cards.tsx",
>>   "src\components\scanner\scanner-filters.tsx",
>>   "src\components\scanner\scanner-empty-state.tsx",
>>
>>   # Paper & overlays
>>   "src\components\paper\paper-trading-overlay.tsx",
>>   "src\components\paper\global-paper-trading-overlay.tsx",
>>   "src\components\paper\journal-workspace.tsx",
>>
>>   # Notifications & broker
>>   "src\components\notifications\notification-panel.tsx",
>>
>>   # Backtest
>>   "src\components\backtest\backtest-workspace.tsx",
>>   "src\components\backtest\release-gate-workbench.tsx",
>>   "src\components\backtest\strategy-version-registry-workbench.tsx",
>>
>>   # System & production
>>   "src\components\system\system-workspace.tsx",
>>   "src\components\system\system-status-panel.tsx",
>>   "src\components\production\production-health-panel.tsx",
>>
>>   # Forward validation & analytics
>>   "src\components\forward-validation\forward-validation-panel.tsx",
>>   "src\components\analytics\signal-funnel-panel.tsx",
>>
>>   # Shared
>>   "src\components\common\badges.tsx",
>>
>>   # Pages
>>   "src\app\backtest\page.tsx",
>>   "src\app\journal\page.tsx",
>>   "src\app\system\page.tsx",
>>   "src\app\error.tsx",
>>   "src\app\loading.tsx"
>> )
PS C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)>
PS C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)> foreach ($f in $files) {
>>   Write-Output ""
>>   Write-Output "========== $f =========="
>>   if (Test-Path -LiteralPath $f) {
>>     Get-Content -LiteralPath $f -Raw
>>   } else {
>>     Write-Output "MISSING"
>>   }
>> }

========== src\app\globals.css ==========
@import "tailwindcss";

:root {
  --background: #0b0e14;
  --foreground: #e4e4e7;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}

html {
  background: var(--background);
  scroll-behavior: smooth;
}

body {
  min-width: 320px;
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

::selection {
  background: rgb(5 150 105 / 0.35);
  color: #f4f4f5;
}

button,
a,
input,
select,
summary {
  -webkit-tap-highlight-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}


.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-none::-webkit-scrollbar {
  display: none;
}


========== tailwind.config.ts ==========
MISSING

========== tailwind.config.js ==========
MISSING

========== postcss.config.js ==========
MISSING

========== postcss.config.mjs ==========
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;


========== src\components\dashboard\dashboard-shell.tsx ==========
import Link from "next/link";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { Badge, ProviderStateBadge } from "@/components/common/badges";
import { GlobalPaperTradingOverlay } from "@/components/paper/global-paper-trading-overlay";

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
    ? releaseLabel.replace(/^STRAT\s*Â·\s*/i, "")
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
            <Badge tone="info" glyph="â—·" className="hidden text-[9px] sm:inline-flex">
              {statusLabel}
            </Badge>
          )}

          {strategyLabel && !statusLabel && (
            <Badge
              tone={releaseBlocked ? "danger" : strategyLabel === "UNVERSIONED" ? "warning" : "info"}
              glyph={releaseBlocked ? "!" : strategyLabel === "UNVERSIONED" ? "!" : "â—†"}
              className="hidden text-[9px] md:inline-flex"
            >
              {strategyLabel}
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {providerId && liveMarketData && (
            <span className="hidden font-mono text-[10px] text-zinc-600 sm:inline">
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

      <GlobalPaperTradingOverlay />
    </div>
  );
}


========== src\components\dashboard\sidebar-nav.tsx ==========
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type PaperOverlayWindow = Window & {
  __fseOpenPaper?: (view: "portfolio" | "journal") => void;
};

const NAV_ITEMS = [
  { kind: "link", href: "/#overview", label: "Home", desktopLabel: "Dashboard", icon: "home" },
  { kind: "paper", label: "Porto", desktopLabel: "Portfolio", icon: "wallet" },
  { kind: "signal", label: "Signal", desktopLabel: "Signal", icon: "signal" },
  { kind: "link", href: "/backtest", label: "Backtest", desktopLabel: "Backtest", icon: "backtest" },
  { kind: "link", href: "/system", label: "System", desktopLabel: "System", icon: "system" },
] as const;

type NavIconName = (typeof NAV_ITEMS)[number]["icon"];

function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  if (name === "home") {
    return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9.5 21v-6h5v6" /></svg>;
  }
  if (name === "wallet") {
    return <svg {...common}><path d="M4 6.5h14a2 2 0 0 1 2 2V19H5a2 2 0 0 1-2-2V6.5A2.5 2.5 0 0 1 5.5 4H17" /><path d="M16 11h5v4h-5a2 2 0 1 1 0-4Z" /></svg>;
  }
  if (name === "signal") {
    return <svg {...common}><path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z" /></svg>;
  }
  if (name === "backtest") {
    return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
}

function MobileNavLabel({
  icon,
  label,
}: {
  icon: NavIconName;
  label: string;
}) {
  return (
    <>
      <NavIcon
        name={icon}
        className={icon === "signal" ? "h-5 w-5 text-yellow-400" : "h-5 w-5"}
      />
      <span className="leading-none">{label}</span>
    </>
  );
}

function DesktopNavLabel({
  icon,
  label,
  primary = false,
}: {
  icon: NavIconName;
  label: string;
  primary?: boolean;
}) {
  return (
    <>
      <NavIcon
        name={icon}
        className={primary ? "h-4 w-4 text-yellow-400" : "h-4 w-4"}
      />
      <span className={primary ? "font-semibold text-amber-300" : ""}>
        {label}
      </span>
    </>
  );
}

export function SidebarNav() {
  const router = useRouter();

  const openPortfolio = () => {
    const browserWindow = window as PaperOverlayWindow;
    if (browserWindow.__fseOpenPaper) {
      browserWindow.__fseOpenPaper("portfolio");
      return;
    }

    window.dispatchEvent(
      new CustomEvent("fse:open-paper", { detail: { view: "portfolio" } })
    );
  };

  const focusReadySignal = () => {
    if (window.location.pathname !== "/") {
      window.sessionStorage.setItem("fse:focus-ready-signal", "1");
      router.push("/#scanner");
      return;
    }

    window.dispatchEvent(new Event("fse:focus-ready-signal"));
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t border-zinc-800 bg-[#0b0e14]/98 md:hidden"
      >
        <div className="grid h-full grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
          {NAV_ITEMS.map((item) => {
            const itemClass =
              "relative z-10 flex min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-0.5 px-1 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

            if (item.kind === "paper") {
              return (
                <button
                  key="portfolio"
                  type="button"
                  onClick={openPortfolio}
                  aria-label="Open paper portfolio"
                  className={itemClass}
                >
                  <MobileNavLabel icon={item.icon} label={item.label} />
                </button>
              );
            }

            if (item.kind === "signal") {
              return (
                <button
                  key="signal"
                  type="button"
                  onClick={focusReadySignal}
                  className={`${itemClass} text-amber-300`}
                >
                  <MobileNavLabel icon={item.icon} label={item.label} />
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={itemClass}
              >
                <MobileNavLabel icon={item.icon} label={item.label} />
              </Link>
            );
          })}
        </div>
      </nav>

      <nav
        aria-label="Primary"
        className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 grid-cols-1 content-start border-r border-zinc-800 bg-transparent px-2 py-4 md:grid"
      >
        {NAV_ITEMS.map((item) => {
          const primary = item.kind === "signal";

          if (item.kind === "paper") {
            return (
              <button
                key="portfolio"
                type="button"
                onClick={openPortfolio}
                aria-label="Open paper portfolio"
                className="flex min-w-0 items-center justify-start gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <DesktopNavLabel
                  icon={item.icon}
                  label={item.desktopLabel}
                />
              </button>
            );
          }

          if (item.kind === "signal") {
            return (
              <button
                key="signal"
                type="button"
                onClick={focusReadySignal}
                className="flex min-w-0 items-center justify-start gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-zinc-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <DesktopNavLabel
                  icon={item.icon}
                  label={item.desktopLabel}
                  primary
                />
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-0 items-center justify-start gap-2 rounded px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <DesktopNavLabel
                icon={item.icon}
                label={item.desktopLabel}
                primary={primary}
              />
            </Link>
          );
        })}
      </nav>
    </>
  );
}


========== src\components\dashboard\system-status-bar.tsx ==========
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


========== src\components\dashboard\dashboard-summary.tsx ==========
/**
 * Compact trading-workstation summary.
 *
 * Keeps only action-oriented counts and lightweight scanner metadata.
 */

import type { ScannerHealth, ScannerSnapshot, SymbolScanResult } from "@/scanner/scanner-result";
import type { SignalView } from "@/scanner/scanner-api";
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
    <div className="min-w-0 px-2 py-2 text-center sm:px-3">
      <div className="truncate text-[10px] font-medium text-zinc-500 sm:text-[11px]">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-lg font-semibold tabular-nums sm:text-xl ${valueClass}`}>
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
      className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/20"
    >
      <div className="grid grid-cols-4 divide-x divide-zinc-800">
        <Kpi label="Ready" value={counts.ready} tone={counts.ready > 0 ? "ready" : "default"} />
        <Kpi label="Armed" value={counts.armed} tone={counts.armed > 0 ? "warn" : "default"} />
        <Kpi label="Blocked" value={counts.blocked} tone={counts.blocked > 0 ? "danger" : "default"} />
        <Kpi label="Issues" value={counts.dataIssues} tone={counts.dataIssues > 0 ? "warn" : "default"} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500 sm:text-xs">
        <span><span className="font-mono text-zinc-300">{counts.scanned}</span> pairs</span>
        <span aria-hidden="true" className="text-zinc-700">Â·</span>
        <span><span className="font-mono text-zinc-300">{activeSignals.length}</span> active</span>
        <span aria-hidden="true" className="text-zinc-700">Â·</span>
        <span>Last scan <span className="font-mono tabular-nums text-zinc-300">{formatTime(health?.lastScanCompletedAt)}</span></span>
      </div>

      {counts.engineExecute > counts.ready && (
        <div className="border-t border-zinc-800 px-3 py-1.5 text-center text-[10px] text-amber-300">
          {counts.engineExecute - counts.ready} engine-ready awaiting lifecycle
        </div>
      )}
    </section>
  );
}


========== src\components\dashboard\market-health-panel.tsx ==========
import { FreshnessBadge, ProviderStateBadge } from "@/components/common/badges";
import { formatDuration, formatTime, NOT_AVAILABLE } from "@/lib/format";
import type { ScannerHealth, ScannerSnapshot } from "@/scanner/scanner-result";

export function MarketHealthPanel({
  snapshot,
  health,
}: {
  snapshot: ScannerSnapshot | null;
  health: ScannerHealth | null;
}) {
  const provider = health?.providerStatus ?? snapshot?.providerStatus ?? null;
  const freshness = snapshot?.freshnessSummary ?? {
    FRESH: 0,
    DELAYED: 0,
    STALE: 0,
  };
  const failedSymbols =
    snapshot?.results
      .filter((result) => result.status !== "ANALYSED")
      .map((result) => result.symbol) ?? [];

  return (
    <section
      aria-labelledby="market-health-title"
      className="rounded-md border border-zinc-800 bg-zinc-900/30"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <div className="min-w-0">
          <h2 id="market-health-title" className="text-sm font-semibold text-zinc-100">
            Market data health
          </h2>
          <p className="mt-0.5 hidden text-[11px] text-zinc-500 sm:block">
            Provider state, freshness, and scan isolation.
          </p>
        </div>
        <ProviderStateBadge state={provider?.state ?? null} />
      </header>

      <div className="flex flex-wrap gap-2 px-3 py-3">
        <FreshnessCount label="FRESH" count={freshness.FRESH} />
        <FreshnessCount label="DELAYED" count={freshness.DELAYED} />
        <FreshnessCount label="STALE" count={freshness.STALE} />
      </div>

      <div className="hidden grid-cols-2 gap-px border-y border-zinc-800 bg-zinc-800 sm:grid lg:grid-cols-4">
        <Metric label="Last scan" value={formatTime(health?.lastScanCompletedAt)} />
        <Metric label="Duration" value={formatDuration(health?.durationMs)} />
        <Metric
          label="Provider latency"
          value={
            provider?.latencyMs === undefined
              ? NOT_AVAILABLE
              : Math.round(provider.latencyMs) + " ms"
          }
        />
        <Metric
          label="Symbol isolation"
          value={
            health
              ? health.symbolsSuccessful + " ok / " + health.symbolsFailed + " failed"
              : NOT_AVAILABLE
          }
        />
      </div>

      <details className="border-t border-zinc-800 sm:hidden">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-medium text-zinc-400">
          <span className="flex items-center justify-between">
            Provider details
            <span aria-hidden="true" className="text-zinc-600">â€º</span>
          </span>
        </summary>
        <dl className="grid grid-cols-2 gap-px border-t border-zinc-800 bg-zinc-800">
          <Metric label="Last scan" value={formatTime(health?.lastScanCompletedAt)} />
          <Metric label="Duration" value={formatDuration(health?.durationMs)} />
          <Metric
            label="Latency"
            value={
              provider?.latencyMs === undefined
                ? NOT_AVAILABLE
                : Math.round(provider.latencyMs) + " ms"
            }
          />
          <Metric
            label="Isolation"
            value={
              health
                ? health.symbolsSuccessful + " ok / " + health.symbolsFailed + " failed"
                : NOT_AVAILABLE
            }
          />
          <Metric label="Last success" value={formatTime(provider?.lastSuccessAt)} />
          <Metric label="Last failure" value={formatTime(provider?.lastFailureAt)} />
        </dl>
      </details>

      <div className="space-y-3 px-3 py-3">
        <div className="hidden sm:block">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Provider timestamps
          </div>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded border border-zinc-800 bg-[#0b0e14] px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-zinc-600">Last success</dt>
              <dd className="mt-0.5 font-mono text-zinc-300">
                {formatTime(provider?.lastSuccessAt)}
              </dd>
            </div>
            <div className="rounded border border-zinc-800 bg-[#0b0e14] px-2.5 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-zinc-600">Last failure</dt>
              <dd className="mt-0.5 font-mono text-zinc-300">
                {formatTime(provider?.lastFailureAt)}
              </dd>
            </div>
          </dl>
        </div>

        {failedSymbols.length > 0 && (
          <div
            role="status"
            className="rounded-md border border-orange-800/40 bg-orange-950/15 px-2.5 py-2"
          >
            <div className="text-[10px] font-medium uppercase tracking-wider text-orange-300">
              Isolated failures
            </div>
            <p className="mt-1 font-mono text-xs text-orange-200/80">
              {failedSymbols.join(", ")}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-orange-200/50">
              Other pairs remain available; failures are isolated per symbol.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900/60 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</dt>
      <dd className="mt-0.5 break-words font-mono text-[11px] text-zinc-300 sm:text-xs">
        {value}
      </dd>
    </div>
  );
}

function FreshnessCount({
  label,
  count,
}: {
  label: "FRESH" | "DELAYED" | "STALE";
  count: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-zinc-800 bg-[#0b0e14] px-2.5 py-2 sm:flex-none sm:justify-start">
      <FreshnessBadge status={label} />
      <span className="font-mono text-sm font-semibold tabular-nums text-zinc-200">
        {count}
      </span>
    </div>
  );
}


========== src\components\signals\signal-detail-panel.tsx ==========
"use client";

import { useEffect } from "react";
import {
  Badge,
  DirectionBadge,
  FreshnessBadge,
} from "@/components/common/badges";
import { ConflictList } from "@/components/signals/conflict-list";
import { EvidenceList } from "@/components/signals/evidence-list";
import { MtfContext } from "@/components/signals/mtf-context";
import { SignalLifecycle } from "@/components/signals/signal-lifecycle";
import { TransitionHistory } from "@/components/signals/transition-history";
import { PriceChart } from "@/components/signals/price-chart";
import { SignalExecutiveSummary } from "@/components/signals/signal-executive-summary";
import {
  formatFixed,
  formatPrice,
  formatTime,
} from "@/lib/format";
import type { SignalView } from "@/scanner/scanner-api";
import type { SymbolScanResult } from "@/scanner/scanner-result";
import type { SignalStateTransition } from "@/types/market-data";
import type { PaperDashboardData } from "@/paper/types";
import { cn } from "@/lib/utils";

export function SignalDetailPanel({
  result,
  signal,
  transitions,
  paper,
  onRefresh,
  refreshing = false,
  onClose,
}: {
  result: SymbolScanResult | null;
  signal: SignalView | null;
  transitions: SignalStateTransition[];
  paper?: PaperDashboardData;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!result) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [result, onClose]);

  if (!result) {
    return (
      <aside
        aria-label="Signal detail"
        className="hidden rounded border border-zinc-800 bg-zinc-900/30 p-6 xl:block"
      >
        <div className="flex min-h-72 flex-col items-center justify-center text-center">
          <span aria-hidden="true" className="text-2xl text-zinc-700">â—‡</span>
          <h2 className="mt-2 text-sm font-semibold text-zinc-300">Select a symbol</h2>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-600">
            Choose a scanner row to inspect the engine evidence, conflicts, lifecycle,
            risk, execution gates, and multi-timeframe context.
          </p>
        </div>
      </aside>
    );
  }

  const failed = result.status !== "ANALYSED";
  const detailLabel = "Signal detail for " + result.symbol;

  return (
    <aside
      role="complementary"
      aria-label={detailLabel}
      className={cn(
        "fixed inset-x-0 bottom-0 top-12 z-40 overflow-y-auto border-t border-zinc-700 bg-[#0b0e14] shadow-2xl",
        "xl:sticky xl:top-16 xl:z-0 xl:max-h-[calc(100vh-5rem)] xl:rounded xl:border xl:border-zinc-800 xl:bg-zinc-900/30 xl:shadow-none"
      )}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-800 bg-[#0b0e14]/95 px-4 py-3 backdrop-blur xl:bg-zinc-900/95">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-base font-semibold tracking-wide text-zinc-100">
              {result.symbol}
            </h2>
            <DirectionBadge direction={result.biasDirection} />
            <FreshnessBadge status={result.freshness} />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{result.reason}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close signal detail"
          className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          Close
        </button>
      </header>

      <div className="space-y-4 p-3 sm:p-4">
        {failed ? (
          <FailureDetail result={result} />
        ) : (
          <>
            <section aria-labelledby="price-chart-title">
              <SectionTitle id="price-chart-title">Price chart</SectionTitle>
              <div className="mt-2">
                <PriceChart symbol={result.symbol} asOf={result.updatedAt} />
              </div>
            </section>

            <SignalExecutiveSummary result={result} />

            <PaperExecutionDetail
              result={result}
              paper={paper}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />

            <section aria-labelledby="mtf-title">
              <SectionTitle id="mtf-title">Multi-timeframe context</SectionTitle>
              <div className="mt-2">
                <MtfContext timeframes={result.timeframes} />
              </div>
            </section>

            <section aria-labelledby="lifecycle-title">
              <SectionTitle id="lifecycle-title">Signal lifecycle</SectionTitle>
              <div className="mt-2">
                <SignalLifecycle state={result.signalState} />
              </div>
              {signal && (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <SmallDatum label="Origin timeframe" value={signal.originTimeframe} />
                  <SmallDatum label="Origin time" value={formatTime(signal.originTimestamp)} />
                  <SmallDatum label="Created" value={formatTime(signal.createdAt)} />
                  <SmallDatum
                    label="Transitions"
                    value={String(signal.transitionCount)}
                  />
                </dl>
              )}
              <div className="mt-3">
                <TransitionHistory transitions={transitions} />
              </div>
            </section>

            <section aria-labelledby="execution-title">
              <SectionTitle id="execution-title">Execution gates</SectionTitle>
              <ExecutionDetail result={result} />
            </section>

            <section aria-labelledby="risk-title">
              <SectionTitle id="risk-title">Risk</SectionTitle>
              <RiskDetail result={result} />
            </section>

            <section aria-labelledby="explain-title">
              <SectionTitle id="explain-title">Explainability</SectionTitle>
              <div className="mt-2 grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Evidence
                  </h3>
                  <EvidenceList evidence={result.evidence} />
                </div>
                <div>
                  <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Conflicts
                  </h3>
                  <ConflictList conflicts={result.conflicts} />
                </div>
              </div>
            </section>

            <DataQuality result={result} />
          </>
        )}
      </div>
    </aside>
  );
}

function PaperExecutionDetail({
  result,
  paper,
  onRefresh,
  refreshing,
}: {
  result: SymbolScanResult;
  paper?: PaperDashboardData;
  onRefresh?: () => Promise<void>;
  refreshing: boolean;
}) {
  if (!result.signalId) return null;

  const order = paper?.recentOrders.find((item) => item.signalId === result.signalId) ?? null;
  const position = paper?.openPositions.find((item) => item.signalId === result.signalId) ?? null;
  const trade = paper?.recentTrades.find((item) => item.signalId === result.signalId) ?? null;

  let label = "NO PAPER ACTION";
  let tone = "muted";
  let note = "This signal has not produced a paper execution.";
  let glyph = "â—Œ";

  if (position) {
    label = "PAPER OPEN";
    tone = "bullish";
    glyph = "â—";
    note = `Paper position is open from ${formatPrice(result.symbol, position.entryPrice)}.`;
  } else if (trade) {
    label = "PAPER CLOSED";
    tone = trade.realizedPnL >= 0 ? "bullish" : "danger";
    glyph = "â– ";
    note = `Closed ${trade.closeReason} at ${formatPrice(result.symbol, trade.exitPrice)} Â· ${trade.realizedR >= 0 ? "+" : ""}${trade.realizedR.toFixed(2)}R.`;
  } else if (order?.status === "REJECTED") {
    label = "PAPER REJECTED";
    tone = "danger";
    glyph = "âœ•";
    note = paperRejectionMessage(order.rejectionReason, result);
  } else if (order?.status === "FILLED") {
    label = "PAPER FILLED";
    tone = "info";
    glyph = "âœ“";
    note = "The paper order was filled; portfolio state is being reconciled.";
  } else if (
    result.executionDecision === "EXECUTE" &&
    result.signalState === "EXECUTE"
  ) {
    label = "PAPER PENDING";
    tone = "warning";
    glyph = "â—·";
    note =
      "The engine and signal lifecycle are both executable. Paper Trading will process this automatically on the next scanner refresh.";
  } else if (result.executionDecision === "EXECUTE") {
    label = "PAPER NOT ACTIONABLE";
    tone = "warning";
    glyph = "!";
    note =
      "The engine decision is EXECUTE, but the signal lifecycle is not executable. No paper position will be opened.";
  }

  return (
    <section aria-labelledby="paper-execution-title">
      <SectionTitle id="paper-execution-title">Paper execution</SectionTitle>
      <div className="mt-2 rounded border border-zinc-800 bg-zinc-900/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge
            tone={tone as "bullish" | "danger" | "info" | "warning" | "muted"}
            glyph={glyph}
          >
            {label}
          </Badge>
          {result.executionDecision === "EXECUTE" &&
            result.signalState === "EXECUTE" &&
            !order &&
            onRefresh && (
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void onRefresh()}
              className="rounded-md border border-emerald-700/60 bg-emerald-950/20 px-2.5 py-1.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-900/30 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              {refreshing ? "Processing..." : "Refresh & process paper"}
            </button>
          )}
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{note}</p>

        {order && (
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
            <Metric label="Paper entry" value={formatPrice(result.symbol, order.fillPrice ?? order.requestedEntry)} />
            <Metric label="Paper SL" value={formatPrice(result.symbol, order.stopLoss)} />
            <Metric label="Paper TP" value={formatPrice(result.symbol, order.takeProfit)} />
            <Metric label="Paper size" value={formatFixed(order.positionSize, 2)} />
          </dl>
        )}
      </div>
    </section>
  );
}

function paperRejectionMessage(
  reason: string | null,
  result: SymbolScanResult
): string {
  switch (reason) {
    case "PAPER_SIGNAL_STATE_NOT_EXECUTE":
      return `Engine decision is EXECUTE, but the signal lifecycle is ${result.signalState ?? "not executable"}. Safety rules prevented a paper position from opening.`;
    case "PAPER_MARKET_DATA_NOT_FRESH":
      return "Market data was not FRESH, so Paper Trading rejected the entry.";
    case "PAPER_RISK_NOT_APPROVED":
      return "The Risk Engine did not approve this entry, so no paper position was opened.";
    case "PAPER_DIRECTION_INVALID":
      return "The signal direction was not LONG or SHORT, so Paper Trading rejected it.";
    case "PAPER_EXECUTION_SNAPSHOT_INCOMPLETE":
      return "The execution snapshot was incomplete. Paper Trading failed closed and did not open a position.";
    case "PAPER_EXECUTION_SNAPSHOT_INVALID":
      return "The execution snapshot contained invalid values. Paper Trading failed closed.";
    case "PAPER_INVALID_LONG_STOP":
      return "The LONG stop was not below entry, so the paper order was rejected.";
    case "PAPER_INVALID_SHORT_STOP":
      return "The SHORT stop was not above entry, so the paper order was rejected.";
    case "PAPER_MAX_OPEN_POSITIONS":
      return "The paper portfolio already reached its configured maximum number of open positions.";
    case "PAPER_MAX_TOTAL_RISK":
      return "Opening this trade would exceed the configured total paper portfolio risk limit.";
    case "PAPER_UPSTREAM_NOT_ANALYSED":
      return "The upstream scanner result was not fully analysed, so Paper Trading rejected it.";
    default:
      return reason
        ? `Paper execution was rejected: ${reason}.`
        : "Paper execution was rejected by a safety rule.";
  }
}

function ExecutionDetail({ result }: { result: SymbolScanResult }) {
  const detail = result.executionDetail;
  if (!detail) {
    return <p className="mt-2 text-xs text-zinc-600">Execution was not evaluated.</p>;
  }

  return (
    <div className="mt-2 space-y-3">
      <ul className="space-y-1">
        {detail.conditions.map((condition) => (
          <li
            key={condition.name}
            className="flex gap-2 rounded border border-zinc-800 bg-zinc-900/30 px-2.5 py-2"
          >
            <span
              aria-hidden="true"
              className={condition.passed ? "text-emerald-400" : "text-orange-400"}
            >
              {condition.passed ? "âœ“" : "âœ•"}
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[11px] text-zinc-200">{condition.name}</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                {condition.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {detail.triggeredVetoes.length > 0 && (
        <div className="rounded border border-orange-700/40 bg-orange-950/20 px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-orange-300">
            Hard vetoes
          </div>
          <ul className="mt-1 space-y-1 font-mono text-[11px] text-orange-200/80">
            {detail.triggeredVetoes.map((veto) => (
              <li key={veto}>âœ• {veto}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Engine reasons
        </div>
        {detail.reasons.length > 0 ? (
          <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-zinc-400">
            {detail.reasons.map((reason, index) => (
              <li key={reason + index} className="flex gap-2">
                <span aria-hidden="true" className="text-zinc-600">â€¢</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-zinc-600">No execution reasons recorded.</p>
        )}
      </div>
    </div>
  );
}

function RiskDetail({ result }: { result: SymbolScanResult }) {
  const risk = result.riskDetail;
  if (!risk) {
    return <p className="mt-2 text-xs text-zinc-600">Risk was not evaluated.</p>;
  }

  return (
    <div className="mt-2">
      <div
        className={cn(
          "mb-2 rounded border px-2.5 py-2 text-xs",
          risk.approved
            ? "border-emerald-700/40 bg-emerald-950/20 text-emerald-200"
            : "border-orange-700/40 bg-orange-950/20 text-orange-200"
        )}
      >
        <span className="font-mono font-semibold">
          {risk.approved ? "âœ“ RISK APPROVED" : "âœ• RISK REJECTED"}
        </span>
        {risk.rejectionReason && (
          <p className="mt-1 text-[11px] opacity-75">{risk.rejectionReason}</p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
        <Metric
          label="Entry"
          value={formatPrice(result.symbol, risk.entryPrice ?? null)}
        />
        <Metric
          label="Stop loss"
          value={formatPrice(result.symbol, risk.stopLoss ?? null)}
        />
        <Metric label="TP1" value={formatPrice(result.symbol, risk.takeProfit1)} />
        <Metric label="TP2" value={formatPrice(result.symbol, risk.takeProfit2)} />
      </dl>
    </div>
  );
}

function DataQuality({ result }: { result: SymbolScanResult }) {
  if (result.issues.length === 0 && result.errors.length === 0) return null;

  return (
    <section aria-labelledby="data-quality-title">
      <SectionTitle id="data-quality-title">Data quality</SectionTitle>
      <div className="mt-2 space-y-1.5">
        {result.issues.map((issue, index) => (
          <div
            key={issue.code + index}
            className="rounded border border-amber-700/40 bg-amber-950/15 px-2.5 py-2"
          >
            <div className="font-mono text-[11px] text-amber-300">{issue.code}</div>
            <p className="mt-0.5 text-[11px] text-amber-200/60">{issue.message}</p>
          </div>
        ))}
        {result.errors.map((error, index) => (
          <div
            key={error + index}
            className="rounded border border-orange-700/40 bg-orange-950/20 px-2.5 py-2 font-mono text-[11px] text-orange-200/80"
          >
            {error}
          </div>
        ))}
      </div>
    </section>
  );
}

function FailureDetail({ result }: { result: SymbolScanResult }) {
  return (
    <section aria-labelledby="failure-title">
      <SectionTitle id="failure-title">Symbol failure</SectionTitle>
      <div className="mt-2 rounded border border-orange-700/50 bg-orange-950/20 p-3">
        <div className="font-mono text-xs font-semibold text-orange-300">
          {result.status.replaceAll("_", " ")}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-orange-200/70">{result.reason}</p>
      </div>
      <DataQuality result={result} />
    </section>
  );
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
      {children}
    </h3>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0b0e14] px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs tabular-nums text-zinc-200">{value}</dd>
    </div>
  );
}

function SmallDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/30 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</dt>
      <dd className="mt-0.5 break-words font-mono text-[11px] text-zinc-300">{value}</dd>
    </div>
  );
}


========== src\components\signals\signal-executive-summary.tsx ==========
import type { SymbolScanResult } from "@/scanner/scanner-result";
import { DirectionBadge, FreshnessBadge } from "@/components/common/badges";
import { formatPrice, formatRatio } from "@/lib/format";
import {
  stageGlyph,
  workstationStages,
  workstationStatus,
  workstationToneClass,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

export function SignalExecutiveSummary({
  result,
}: {
  result: SymbolScanResult;
}) {
  const status = workstationStatus(result);
  const stages = workstationStages(result);
  const risk = result.riskDetail;

  return (
    <section
      aria-labelledby="signal-summary-title"
      className="rounded-lg border border-zinc-800 bg-[#0b0e14]/65 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="signal-summary-title"
              className="font-mono text-lg font-semibold tracking-wide text-zinc-100"
            >
              {result.symbol}
            </h3>
            <DirectionBadge direction={result.biasDirection} />
            <FreshnessBadge status={result.freshness} />
          </div>

          <div className={cn("mt-3 text-lg font-semibold", workstationToneClass(status.tone))}>
            {status.headline}
          </div>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-500">
            {status.detail}
          </p>
        </div>

        <div className="text-right">
          <div className="text-[11px] text-zinc-600">Current price</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-zinc-100">
            {formatPrice(result.symbol, result.latestPrice)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1">
        {stages.map((stage) => (
          <div key={stage.label} className="min-w-0">
            <div
              className={cn(
                "h-1 rounded-full",
                stage.state === "done" && "bg-emerald-500/70",
                stage.state === "current" && "bg-amber-500/70",
                stage.state === "blocked" && "bg-red-500/70",
                stage.state === "pending" && "bg-zinc-800"
              )}
            />
            <div
              className={cn(
                "mt-1.5 truncate text-[10px] sm:text-[11px]",
                stage.state === "done" && "text-emerald-300",
                stage.state === "current" && "text-amber-300",
                stage.state === "blocked" && "text-red-300",
                stage.state === "pending" && "text-zinc-600"
              )}
            >
              {stageGlyph(stage)} {stage.label}
            </div>
          </div>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
        <Metric label="Entry" value={formatPrice(result.symbol, risk?.entryPrice ?? null)} />
        <Metric label="Stop" value={formatPrice(result.symbol, risk?.stopLoss ?? null)} />
        <Metric label="Target" value={formatPrice(result.symbol, risk?.takeProfit1 ?? null)} />
        <Metric label="R:R" value={formatRatio(result.riskReward ?? risk?.plannedRR ?? null)} />
      </dl>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-600">
        <span>Engine {result.executionDecision ?? "â€”"}</span>
        <span>Lifecycle {result.signalState ?? "â€”"}</span>
        <span>Setup {result.setupState ?? "â€”"}</span>
        <span>Trigger {result.triggerState ?? "â€”"}</span>
      </div>

      {result.strategyRouting && (
        <div
          aria-label="Strategy routing"
          className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/35 px-3 py-2.5"
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
            <span className="text-zinc-500">
              Regime <strong className="font-medium text-zinc-300">{result.strategyRouting.regime}</strong>
            </span>
            <span className="text-zinc-500">
              Preferred <strong className="font-medium text-zinc-300">{result.strategyRouting.preferredStrategyId ?? "WAIT"}</strong>
            </span>
            <span className="text-zinc-500">
              Active <strong className="font-medium text-zinc-300">{result.strategyId ?? "â€”"}</strong>
            </span>
            <span className="text-zinc-500">
              Route <strong className="font-medium text-zinc-300">{result.strategyRouting.mode}</strong>
            </span>
          </div>
          {result.strategyRouting.mode === "COMPATIBILITY_FALLBACK" && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-amber-300/80">
              {result.strategyRouting.reason}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0b0e14] px-3 py-2.5">
      <dt className="text-[11px] text-zinc-600">{label}</dt>
      <dd className="mt-1 font-mono text-xs tabular-nums text-zinc-200">{value}</dd>
    </div>
  );
}


========== src\components\signals\signal-lifecycle.tsx ==========
/**
 * Signal lifecycle visualization.
 *
 * Renders the engine's own state sequence as a stepper and shows safety or
 * terminal states separately. The UI adds no lifecycle states of its own.
 */

import type { SignalState } from "@/types/market";
import { cn } from "@/lib/utils";

const PROGRESSION: SignalState[] = [
  "DISCOVERED",
  "WATCH",
  "SETUP",
  "ARMED",
  "TRIGGERED",
  "RISK_APPROVED",
  "EXECUTE",
];

const TERMINAL_STATES: SignalState[] = ["BLOCKED", "INVALIDATED", "CLOSED"];

export function SignalLifecycle({ state }: { state: SignalState | null }) {
  if (!state) {
    return <p className="text-xs text-zinc-600">No signal lifecycle for this symbol.</p>;
  }

  if (state === "MANAGE") {
    return (
      <div
        role="status"
        className="rounded border border-sky-700/40 bg-sky-950/20 px-3 py-2 text-xs text-sky-200"
      >
        <span className="font-mono font-semibold uppercase tracking-wide">MANAGE</span>
        <p className="mt-0.5 text-[11px] text-sky-200/60">
          The engine reports an existing management state. Phase 3 only displays it;
          no broker or trade-management action is performed here.
        </p>
      </div>
    );
  }

  if (TERMINAL_STATES.includes(state)) {
    return (
      <div
        role="status"
        className={cn(
          "rounded border px-3 py-2 text-xs",
          state === "BLOCKED"
            ? "border-orange-700/50 bg-orange-950/20 text-orange-200"
            : "border-zinc-700 bg-zinc-900/40 text-zinc-300"
        )}
      >
        <span className="font-mono font-semibold uppercase tracking-wide">{state}</span>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {state === "BLOCKED"
            ? "Execution is blocked. The block reasons below are the engine's own."
            : state === "INVALIDATED"
              ? "The setup was invalidated and is no longer actionable."
              : "The signal reached the end of its lifecycle."}
        </p>
      </div>
    );
  }

  const currentIndex = PROGRESSION.indexOf(state);

  return (
    <ol className="flex flex-wrap items-center gap-1">
      {PROGRESSION.map((step, index) => {
        const reached = index <= currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                isCurrent
                  ? "border-emerald-600/70 bg-emerald-600/15 text-emerald-300"
                  : reached
                    ? "border-zinc-600 bg-zinc-800/60 text-zinc-300"
                    : "border-zinc-800 text-zinc-600"
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              {step}
            </span>
            {index < PROGRESSION.length - 1 && (
              <span aria-hidden="true" className="text-[10px] text-zinc-700">
                â†’
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}


========== src\components\signals\evidence-list.tsx ==========
/**
 * Engine evidence list.
 *
 * Renders the structured evidence the engines already returned. The UI never
 * generates an explanation and never re-weights anything: weights shown are the
 * engine's own values.
 */

import type { Evidence } from "@/types/engine";
import { formatScore } from "@/lib/format";

export function EvidenceList({
  evidence,
  emptyLabel = "No evidence recorded",
}: {
  evidence: Evidence[];
  emptyLabel?: string;
}) {
  if (evidence.length === 0) {
    return <p className="text-xs text-zinc-600">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {evidence.map((item, index) => (
        <li
          key={`${item.code}-${index}`}
          className="flex gap-2 rounded border border-zinc-800/70 bg-zinc-900/30 px-2.5 py-2"
        >
          <span aria-hidden="true" className="mt-0.5 text-[11px] text-emerald-400">
            +
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-medium text-zinc-200">{item.label}</span>
              {item.weight !== undefined && (
                <span
                  className="font-mono text-[10px] text-zinc-500"
                  title="Engine-assigned weight (0-100)"
                >
                  w {formatScore(item.weight)}
                </span>
              )}
              <code className="ml-auto hidden font-mono text-[10px] text-zinc-600 sm:inline">{item.code}</code>
            </div>
            {item.description && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                {item.description}
              </p>
            )}
            {item.value !== undefined && (
              <p className="mt-0.5 hidden font-mono text-[11px] text-zinc-400 sm:block">
                {String(item.value)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}


========== src\components\signals\conflict-list.tsx ==========
/**
 * Engine conflict list.
 *
 * Phase 1 surfaces the evidence that argues AGAINST its own conclusion; this
 * renders it separately and prominently, so the counter-case is always visible
 * next to the bull case.
 */

import type { Conflict } from "@/types/engine";
import { formatScore } from "@/lib/format";

export function ConflictList({
  conflicts,
  emptyLabel = "No conflicts recorded",
}: {
  conflicts: Conflict[];
  emptyLabel?: string;
}) {
  if (conflicts.length === 0) {
    return <p className="text-xs text-zinc-600">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {conflicts.map((item, index) => (
        <li
          key={`${item.code}-${index}`}
          className="flex gap-2 rounded border border-amber-700/40 bg-amber-950/20 px-2.5 py-2"
        >
          <span aria-hidden="true" className="mt-0.5 text-[11px] text-amber-400">
            âˆ’
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-medium text-amber-200/90">{item.label}</span>
              {item.weight !== undefined && (
                <span
                  className="font-mono text-[10px] text-amber-600/80"
                  title="Engine-assigned weight (0-100)"
                >
                  w {formatScore(item.weight)}
                </span>
              )}
              <code className="ml-auto hidden font-mono text-[10px] text-amber-700/70 sm:inline">{item.code}</code>
            </div>
            {item.description && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/60">
                {item.description}
              </p>
            )}
            {item.value !== undefined && (
              <p className="mt-0.5 hidden font-mono text-[11px] text-amber-200/70 sm:block">
                {String(item.value)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}


========== src\components\signals\mtf-context.tsx ==========
/**
 * Multi-timeframe context summary.
 *
 * Shows the role each timeframe plays and the data depth/freshness behind it,
 * exactly as the scanner reports. No structure is recomputed here.
 */

import type { TimeframeSummary } from "@/scanner/scanner-result";
import { FreshnessBadge } from "@/components/common/badges";
import { TIMEFRAME_ROLE_LABEL } from "@/lib/signal-meta";
import { formatTimeShort, NOT_AVAILABLE } from "@/lib/format";

export function MtfContext({ timeframes }: { timeframes: TimeframeSummary[] }) {
  if (!timeframes || timeframes.length === 0) {
    return <p className="text-xs text-zinc-600">{NOT_AVAILABLE} No timeframe context.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {timeframes.map((tf) => (
        <div
          key={`${tf.role}-${tf.timeframe}`}
          className="rounded border border-zinc-800 bg-zinc-900/40 px-2.5 py-2"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-zinc-100">{tf.timeframe}</span>
            <FreshnessBadge status={tf.freshness} />
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
            {TIMEFRAME_ROLE_LABEL[tf.role]}
          </div>
          <div className="mt-1 font-mono text-[10px] text-zinc-600">
            {tf.closedCandles} closed Â· {formatTimeShort(tf.asOf)}
          </div>
        </div>
      ))}
    </div>
  );
}


========== src\components\signals\transition-history.tsx ==========
/**
 * Transition history (audit trail).
 *
 * Renders the transitions the scanner already recorded: time, previous state,
 * new state, reason. Compact, oldest first.
 */

import type { SignalStateTransition } from "@/types/market-data";
import { formatTimeShort, NOT_AVAILABLE } from "@/lib/format";

export function TransitionHistory({
  transitions,
  emptyLabel = "No transitions recorded yet",
}: {
  transitions: SignalStateTransition[];
  emptyLabel?: string;
}) {
  if (transitions.length === 0) {
    return <p className="text-xs text-zinc-600">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left font-mono text-[11px]">
        <caption className="sr-only">Signal state transitions, oldest first</caption>
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-zinc-600">
            <th scope="col" className="py-1 pr-3 font-medium">Time</th>
            <th scope="col" className="py-1 pr-3 font-medium">From</th>
            <th scope="col" className="py-1 pr-3 font-medium">To</th>
            <th scope="col" className="py-1 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody>
          {transitions.map((transition, index) => (
            <tr key={`${transition.signalId}-${index}`} className="border-t border-zinc-800/70">
              <td className="py-1 pr-3 tabular-nums text-zinc-500">
                {formatTimeShort(transition.timestamp)}
              </td>
              <td className="py-1 pr-3 text-zinc-500">
                {transition.previousState ?? NOT_AVAILABLE}
              </td>
              <td className="py-1 pr-3 text-zinc-200">{transition.newState}</td>
              <td className="py-1 text-zinc-400">{transition.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


========== src\components\signals\price-chart.tsx ==========
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PriceChartCandle, PriceChartResponse } from "@/types/chart";
import type { Timeframe } from "@/types/market";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["M15", "H1", "H4", "D1"];
const WIDTH = 900;
const HEIGHT = 380;
const PAD = { top: 18, right: 70, bottom: 28, left: 10 };

export function visibleBarsForWidth(width: number): number {
  if (width < 600) return 60;
  if (width < 1000) return 80;
  return 120;
}

export function PriceChart({
  symbol,
  asOf,
}: {
  symbol: string;
  asOf: number | null;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("H1");
  const [data, setData] = useState<PriceChartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibleBars, setVisibleBars] = useState(60);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      symbol,
      timeframe,
      limit: "200",
    });
    if (asOf !== null) params.set("asOf", String(asOf));

    fetch("/api/market/candles?" + params.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "Chart data request failed.");
        }
        return (await response.json()) as PriceChartResponse;
      })
      .then((next) => {
        setError(null);
        setData(next);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => controller.abort();
  }, [symbol, timeframe, asOf]);

  useEffect(() => {
    const element = chartContainerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (!width) return;
      const next = visibleBarsForWidth(width);
      setVisibleBars((current) => (current === next ? current : next));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section aria-label={"Price chart for " + symbol} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              aria-pressed={timeframe === tf}
              onClick={() => {
                if (tf === timeframe) return;
                setData(null);
                setError(null);
                setTimeframe(tf);
              }}
              className={cn(
                "rounded px-2.5 py-1.5 font-mono text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
                timeframe === tf
                  ? "bg-emerald-950/60 text-emerald-300"
                  : "text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
              )}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
            {data?.candles.length
              ? formatPrice(symbol, data.candles[data.candles.length - 1].close)
              : "â€”"}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600">
            {timeframe} Â· closed candles
          </div>
        </div>
      </div>

      <div
        ref={chartContainerRef}
        className="overflow-hidden rounded-md border border-zinc-800 bg-[#090c11]"
      >
        {!data && !error ? (
          <div
            aria-busy="true"
            className="flex h-72 items-center justify-center text-xs text-zinc-600"
          >
            Loading price chartâ€¦
          </div>
        ) : error ? (
          <div role="alert" className="flex h-72 flex-col items-center justify-center p-5 text-center">
            <div className="font-mono text-xs font-semibold text-orange-300">
              CHART DATA UNAVAILABLE
            </div>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">{error}</p>
          </div>
        ) : data && data.candles.length > 0 ? (
          <CandlesSvg data={data} visibleBars={visibleBars} />
        ) : (
          <div className="flex h-72 items-center justify-center text-xs text-zinc-600">
            No closed candles available.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-600">
        <span>
          {data ? Math.min(data.candles.length, visibleBars) : 0} visible Â· {data?.candles.length ?? 0} loaded
        </span>
        <span>
          {data?.source ? data.source.toUpperCase() + " provider" : "â€”"}
        </span>
      </div>
    </section>
  );
}

function CandlesSvg({
  data,
  visibleBars,
}: {
  data: PriceChartResponse;
  visibleBars: number;
}) {
  const model = useMemo(() => chartModel(data, visibleBars), [data, visibleBars]);
  const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);

  const activeCandle =
    model.candles.find((candle) => candle.timestamp === hoveredTimestamp) ??
    model.candles.find((candle) => candle.timestamp === selectedTimestamp) ??
    model.candles.at(-1) ??
    null;

  return (
    <div className="relative">
      {activeCandle && (
        <OhlcReadout
          candle={activeCandle}
          symbol={data.symbol}
          timeframe={data.timeframe}
        />
      )}

      <svg
        viewBox={"0 0 " + WIDTH + " " + HEIGHT}
        role="img"
        aria-label={
          data.symbol +
          " " +
          data.timeframe +
          " candlestick chart with " +
          model.candles.length +
          " closed candles"
        }
        className="block h-auto min-h-64 w-full touch-pan-y select-none"
        preserveAspectRatio="none"
      >
        <rect width={WIDTH} height={HEIGHT} fill="#090c11" />

        {model.gridY.map((grid) => (
          <g key={grid.y}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={grid.y}
              y2={grid.y}
              stroke="#27272a"
              strokeWidth="1"
            />
            <text
              x={WIDTH - PAD.right + 8}
              y={grid.y + 4}
              fill="#71717a"
              fontSize="11"
              fontFamily="ui-monospace, monospace"
            >
              {grid.label}
            </text>
          </g>
        ))}

        <line
          data-testid="current-price-line"
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={model.currentPriceY}
          y2={model.currentPriceY}
          stroke="#10b981"
          strokeWidth="1"
          strokeDasharray="5 4"
          opacity="0.75"
        />
        <rect
          x={WIDTH - PAD.right + 3}
          y={model.currentPriceY - 8}
          width={64}
          height={16}
          rx="3"
          fill="#064e3b"
        />
        <text
          x={WIDTH - PAD.right + 35}
          y={model.currentPriceY + 4}
          textAnchor="middle"
          fill="#a7f3d0"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          {model.currentPriceLabel}
        </text>

        {model.candles.map((candle) => (
          <g key={candle.timestamp}>
            <line
              x1={candle.x}
              x2={candle.x}
              y1={candle.highY}
              y2={candle.lowY}
              stroke={candle.up ? "#34d399" : "#fb7185"}
              strokeWidth="1.2"
            />
            <rect
              x={candle.x - candle.bodyWidth / 2}
              y={candle.bodyY}
              width={candle.bodyWidth}
              height={candle.bodyHeight}
              rx="0.5"
              fill={candle.up ? "#10b981" : "#e11d48"}
            />
          </g>
        ))}

        {model.candles.map((candle) => (
          <rect
            key={"hit-" + candle.timestamp}
            data-candle-timestamp={candle.timestamp}
            x={candle.x - model.step / 2}
            y={PAD.top}
            width={model.step}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="transparent"
            onPointerEnter={() => setHoveredTimestamp(candle.timestamp)}
            onPointerLeave={() => setHoveredTimestamp(null)}
            onPointerDown={() =>
              setSelectedTimestamp((current) =>
                current === candle.timestamp ? null : candle.timestamp
              )
            }
          />
        ))}

        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={HEIGHT - PAD.bottom}
          y2={HEIGHT - PAD.bottom}
          stroke="#3f3f46"
          strokeWidth="1"
        />

        <text
          x={PAD.left}
          y={HEIGHT - 8}
          fill="#52525b"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          {model.startLabel}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 8}
          textAnchor="end"
          fill="#52525b"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          {model.endLabel}
        </text>
      </svg>
    </div>
  );
}

function OhlcReadout({
  candle,
  symbol,
  timeframe,
}: {
  candle: PriceChartCandle;
  symbol: string;
  timeframe: Timeframe;
}) {
  return (
    <div
      data-testid="chart-ohlc"
      aria-live="polite"
      className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap gap-x-2 gap-y-0.5 rounded border border-zinc-800/80 bg-[#090c11]/90 px-2 py-1 font-mono text-[9px] text-zinc-500 backdrop-blur sm:text-[10px]"
    >
      <span className="text-zinc-300">{chartTimeLabel(candle.timestamp, timeframe)}</span>
      <span>O <b className="font-medium text-zinc-300">{formatPrice(symbol, candle.open)}</b></span>
      <span>H <b className="font-medium text-emerald-300">{formatPrice(symbol, candle.high)}</b></span>
      <span>L <b className="font-medium text-rose-300">{formatPrice(symbol, candle.low)}</b></span>
      <span>C <b className="font-medium text-zinc-100">{formatPrice(symbol, candle.close)}</b></span>
    </div>
  );
}

function chartModel(data: PriceChartResponse, visibleBars: number) {
  const source = data.candles.slice(-visibleBars);
  const highs = source.map((candle) => candle.high);
  const lows = source.map((candle) => candle.low);
  let max = Math.max(...highs);
  let min = Math.min(...lows);
  const span = Math.max(max - min, Math.abs(max) * 0.0001, 1e-8);
  const extra = span * 0.08;
  max += extra;
  min -= extra;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = plotWidth / Math.max(source.length, 1);
  const bodyWidth = Math.max(1.8, Math.min(8, step * 0.62));
  const y = (value: number) =>
    PAD.top + ((max - value) / Math.max(max - min, 1e-8)) * plotHeight;

  const candles = source.map((candle, index) => {
    const openY = y(candle.open);
    const closeY = y(candle.close);
    return {
      ...candle,
      x: PAD.left + step * index + step / 2,
      highY: y(candle.high),
      lowY: y(candle.low),
      bodyY: Math.min(openY, closeY),
      bodyHeight: Math.max(1.4, Math.abs(closeY - openY)),
      bodyWidth,
      up: candle.close >= candle.open,
    };
  });

  const gridY = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = max - (max - min) * ratio;
    return {
      y: PAD.top + plotHeight * ratio,
      label: value.toFixed(data.pricePrecision),
    };
  });

  const currentPrice = source.at(-1)?.close ?? 0;

  return {
    candles,
    gridY,
    step,
    currentPriceY: y(currentPrice),
    currentPriceLabel: currentPrice.toFixed(data.pricePrecision),
    startLabel: source[0] ? chartTimeLabel(source[0].timestamp, data.timeframe) : "",
    endLabel: source.at(-1)
      ? chartTimeLabel(source.at(-1)!.timestamp, data.timeframe)
      : "",
  };
}

function chartTimeLabel(timestamp: number, timeframe: Timeframe): string {
  const date = new Date(timestamp);
  if (timeframe === "D1") {
    return (
      String(date.getUTCDate()).padStart(2, "0") +
      "/" +
      String(date.getUTCMonth() + 1).padStart(2, "0")
    );
  }

  return (
    String(date.getUTCHours()).padStart(2, "0") +
    ":" +
    String(date.getUTCMinutes()).padStart(2, "0")
  );
}


========== src\components\scanner\scanner-table.tsx ==========
"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import {
  DirectionBadge,
  FreshnessBadge,
} from "@/components/common/badges";
import {
  formatPrice,
  formatRatio,
  formatScore,
  formatTimeShort,
} from "@/lib/format";
import {
  workstationStatus,
  workstationToneClass,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

export function ScannerTable({
  results,
  selectedSymbol,
  onSelect,
}: {
  results: SymbolScanResult[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Scanner results. Activate a row to open signal detail.
        </caption>
        <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
          <tr className="text-[11px] font-medium text-zinc-500">
            <th scope="col" className="px-3 py-2 font-medium">Pair</th>
            <th scope="col" className="px-2 py-2 font-medium">Direction</th>
            <th scope="col" className="px-2 py-2 font-medium">Setup</th>
            <th scope="col" className="px-2 py-2 font-medium">Trigger</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">R:R</th>
            <th scope="col" className="px-2 py-2 font-medium">Decision</th>
            <th scope="col" className="px-2 py-2 font-medium">Freshness</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {results.map((result) => {
            const selected = result.symbol === selectedSymbol;
            const status = workstationStatus(result);
            const failed = result.status !== "ANALYSED";

            return (
              <tr
                key={result.symbol}
                data-signal-symbol={result.symbol}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(result.symbol)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(result.symbol);
                  }
                }}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-zinc-800/45 focus-visible:bg-zinc-800/60 focus-visible:outline-none",
                  selected && "bg-zinc-800/55"
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="font-mono text-sm font-semibold text-zinc-100">
                    {result.symbol}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-600">
                    {formatPrice(result.symbol, result.latestPrice)}
                  </div>
                </td>

                {failed ? (
                  <td colSpan={6} className="px-2 py-2.5">
                    <div className="text-xs font-semibold text-red-300">Data issue</div>
                    <div className="mt-0.5 max-w-2xl truncate text-[11px] text-zinc-500">
                      {result.reason}
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-2.5">
                      <DirectionBadge direction={result.biasDirection} />
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="text-xs text-zinc-300">{result.setupState ?? "â€”"}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-zinc-600">
                        score {formatScore(result.setupScore)}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-zinc-300">
                      {result.triggerState ?? "â€”"}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-200">
                      {formatRatio(result.riskReward)}
                    </td>
                    <td className="min-w-44 px-2 py-2.5">
                      <div className={cn("text-xs font-semibold", workstationToneClass(status.tone))}>
                        {status.headline}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
                        {result.executionDecision ?? "â€”"} Â· {result.signalState ?? "â€”"}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <FreshnessBadge status={result.freshness} />
                    </td>
                  </>
                )}

                <td className="px-3 py-2.5 text-right font-mono text-[11px] tabular-nums text-zinc-500">
                  {formatTimeShort(result.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


========== src\components\scanner\scanner-cards.tsx ==========
"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import {
  DirectionBadge,
  FreshnessBadge,
} from "@/components/common/badges";
import { BIAS_DISPLAY } from "@/lib/signal-meta";
import {
  formatPips,
  formatPrice,
  formatRatio,
  formatScore,
  formatTimeShort,
} from "@/lib/format";
import { workstationStatus } from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

export function ScannerCards({
  results,
  selectedSymbol,
  onSelect,
}: {
  results: SymbolScanResult[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  return (
    <ul>
      {results.map((result) => (
        <ScannerCard
          key={result.symbol}
          result={result}
          selected={result.symbol === selectedSymbol}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function potentialPips(result: SymbolScanResult): number | null {
  const risk = result.riskDetail;
  if (
    !risk ||
    risk.entryPrice === null ||
    risk.entryPrice === undefined ||
    risk.takeProfit1 === null ||
    risk.takeProfit1 === undefined ||
    risk.pipSize === null ||
    risk.pipSize === undefined ||
    !Number.isFinite(risk.entryPrice) ||
    !Number.isFinite(risk.takeProfit1) ||
    !Number.isFinite(risk.pipSize) ||
    risk.pipSize <= 0
  ) {
    return null;
  }

  return Math.abs(risk.takeProfit1 - risk.entryPrice) / risk.pipSize;
}

function setupChipClass(score: number | null): string {
  if (score === null || !Number.isFinite(score)) {
    return "border-zinc-700 bg-zinc-900/50 text-zinc-400";
  }
  if (score >= 80) {
    return "border-emerald-700/70 bg-emerald-950/25 text-emerald-300";
  }
  if (score >= 60) {
    return "border-amber-700/70 bg-amber-950/25 text-amber-300";
  }
  return "border-rose-800/70 bg-rose-950/25 text-rose-300";
}

function engineTone(decision: string | null): string {
  if (decision === "EXECUTE") return "text-emerald-300";
  if (decision === "WAIT") return "text-amber-300";
  if (decision === "BLOCKED") return "text-red-300";
  if (decision === "INVALIDATED") return "text-zinc-500";
  return "text-zinc-400";
}

function biasTone(bias: string | null): string {
  if (bias === "STRONG_LONG") return "text-emerald-300";
  if (bias === "STRONG_SHORT") return "text-red-300";
  return "text-zinc-400";
}

function ScannerCard({
  result,
  selected,
  onSelect,
}: {
  result: SymbolScanResult;
  selected: boolean;
  onSelect: (symbol: string) => void;
}) {
  const status = workstationStatus(result);
  const failed = result.status !== "ANALYSED";
  const risk = result.riskDetail;
  const pips = potentialPips(result);
  const bias = result.bias ? BIAS_DISPLAY[result.bias] : "â€”";

  return (
    <li
      data-signal-symbol={result.symbol}
      className={cn(
        "border-b border-zinc-700/80 border-l-2 bg-zinc-950/10 transition-colors last:border-b-0",
        status.tone === "ready"
          ? "border-l-emerald-500"
          : status.tone === "waiting"
            ? "border-l-amber-500"
            : status.tone === "blocked"
              ? "border-l-red-500"
              : "border-l-zinc-700",
        selected && "bg-zinc-800/45"
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(result.symbol)}
        aria-pressed={selected}
        aria-label={`Open signal detail for ${result.symbol}`}
        className="w-full px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
      >
        <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <span className="font-mono text-base font-semibold tracking-wide text-zinc-100">
            {result.symbol}
          </span>
          <DirectionBadge direction={result.biasDirection} className="text-[9px]" />
          <FreshnessBadge status={result.freshness} className="text-[9px]" />
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums",
              setupChipClass(result.setupScore)
            )}
            title="Setup score"
          >
            {formatScore(result.setupScore)}
          </span>
          <span className="ml-auto min-w-[5.3rem] text-right font-mono text-base font-semibold tabular-nums text-zinc-100">
            {formatPrice(result.symbol, result.latestPrice)}
          </span>
        </div>

        {failed ? (
          <>
            <div className="mt-2 truncate border-t border-zinc-800/70 pt-2 text-[11px] text-red-300">
              Data issue Â· {result.reason}
            </div>
            <div className="mt-1 font-mono text-[10px] text-zinc-600">
              Engine status {result.status.replaceAll("_", " ")}
            </div>
          </>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-[1fr_1.35fr_1fr_auto] items-center gap-x-2 border-t border-zinc-800/70 pt-2 text-[9px] sm:gap-x-3 sm:text-[10px]">
              <span className="min-w-0 whitespace-nowrap text-left text-zinc-500">
                Entry{" "}
                <span className="font-mono tabular-nums text-zinc-300">
                  {formatPrice(result.symbol, risk?.entryPrice ?? null)}
                </span>
              </span>

              <span className="min-w-0 truncate whitespace-nowrap text-center text-zinc-500">
                TP{" "}
                <span className="font-mono tabular-nums text-emerald-300">
                  {formatPrice(result.symbol, risk?.takeProfit1 ?? null)}
                </span>
                {pips !== null && (
                  <span className="font-mono tabular-nums text-emerald-300">
                    {" "}({formatPips(pips, true)})
                  </span>
                )}
              </span>

              <span className="min-w-0 whitespace-nowrap text-center text-zinc-500">
                SL{" "}
                <span className="font-mono tabular-nums text-red-300">
                  {formatPrice(result.symbol, risk?.stopLoss ?? null)}
                </span>
              </span>

              <span className="min-w-0 whitespace-nowrap text-right text-zinc-500">
                R:R{" "}
                <span className="font-mono tabular-nums text-zinc-300">
                  {formatRatio(result.riskReward)}
                </span>
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2 text-[10px] leading-5">
              <span className={cn("truncate font-medium", biasTone(result.bias))}>
                {bias}
              </span>

              <div className="ml-auto flex items-center justify-end gap-2">
                <span className="whitespace-nowrap text-right text-zinc-600">
                  Engine{" "}
                  <span className={cn("font-mono", engineTone(result.executionDecision))}>
                    {result.executionDecision ?? "â€”"}
                  </span>
                </span>

                <span className="whitespace-nowrap text-right text-zinc-600">
                  Lifecycle{" "}
                  <span className="font-mono text-zinc-400">
                    {result.signalState ?? "â€”"}
                  </span>
                </span>

                <span className="whitespace-nowrap text-right font-mono tabular-nums text-zinc-600">
                  {formatTimeShort(result.updatedAt)}
                </span>
              </div>
            </div>
          </>
        )}
      </button>
    </li>
  );
}


========== src\components\scanner\scanner-filters.tsx ==========
/**
 * Scanner controls.
 *
 * Desktop keeps the full workstation control row. Mobile shows search + a small
 * set of high-value state chips and moves direction/freshness/sort into a
 * disclosure panel so controls do not compete with the scanner itself.
 */

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  STATE_FILTER_LABELS,
  type DirectionFilter,
  type FreshnessFilter,
  type ScannerQuery,
  type ScannerSort,
  type SortDir,
  type SortKey,
  type StateFilter,
} from "@/lib/scanner-query";

const SORT_LABELS: Record<SortKey, string> = {
  attention: "Attention",
  symbol: "Symbol",
  biasScore: "Bias score",
  setupScore: "Setup score",
  riskReward: "R:R",
  updatedAt: "Updated",
};

const MOBILE_STATE_FILTERS: StateFilter[] = [
  "ALL",
  "EXECUTE",
  "ARMED",
  "BLOCKED",
  "FAILED",
];

export function ScannerFilters({
  query,
  sort,
  resultCount,
  onQueryChange,
  onSortChange,
  onClear,
}: {
  query: ScannerQuery;
  sort: ScannerSort;
  resultCount: number;
  onQueryChange: (query: ScannerQuery) => void;
  onSortChange: (sort: ScannerSort) => void;
  onClear: () => void;
}) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const stateChips = Object.keys(STATE_FILTER_LABELS) as StateFilter[];
  const advancedCount =
    Number(query.direction !== "ALL") +
    Number(query.freshness !== "ALL") +
    Number(sort.key !== "attention" || sort.dir !== "asc");

  return (
    <div className="border-b border-zinc-800">
      <div className="space-y-2 px-3 py-2.5 md:hidden">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search symbols</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600"
            >
              <circle cx="8.5" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="m12 12 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query.query}
              onChange={(event) =>
                onQueryChange({ ...query, query: event.target.value })
              }
              placeholder="Search pair"
              aria-label="Search symbols"
              className="h-9 w-full rounded-md border border-zinc-700 bg-[#0b0e14] pl-8 pr-3 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40"
            />
          </label>
          <button
            type="button"
            aria-expanded={mobileFiltersOpen}
            aria-controls="mobile-scanner-filters"
            onClick={() => setMobileFiltersOpen((open) => !open)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
              mobileFiltersOpen || advancedCount > 0
                ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-300"
            )}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
              <path d="M3 5h14M5.5 10h9M8 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>Filters{advancedCount > 0 ? ` ${advancedCount}` : ""}</span>
          </button>
        </div>

        <div className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5 scrollbar-none">
          {MOBILE_STATE_FILTERS.map((chip) => (
            <StateChip
              key={chip}
              chip={chip}
              active={query.state === chip}
              onClick={() => onQueryChange({ ...query, state: chip })}
              mobile
            />
          ))}
          <span
            aria-live="polite"
            className="ml-auto hidden shrink-0 self-center pl-2 font-mono text-[11px] text-zinc-600 sm:inline"
          >
            {resultCount} shown
          </span>
        </div>

        {mobileFiltersOpen && (
          <div
            id="mobile-scanner-filters"
            className="grid grid-cols-2 gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2.5"
          >
            <FilterSelect
              label="Direction"
              value={query.direction}
              onChange={(value) =>
                onQueryChange({ ...query, direction: value as DirectionFilter })
              }
              options={[
                ["ALL", "All"],
                ["LONG", "Long"],
                ["SHORT", "Short"],
                ["NEUTRAL", "Neutral"],
              ]}
            />
            <FilterSelect
              label="Freshness"
              value={query.freshness}
              onChange={(value) =>
                onQueryChange({ ...query, freshness: value as FreshnessFilter })
              }
              options={[
                ["ALL", "All"],
                ["FRESH", "Fresh"],
                ["DELAYED", "Delayed"],
                ["STALE", "Stale"],
              ]}
            />
            <FilterSelect
              label="Sort"
              value={sort.key}
              onChange={(value) =>
                onSortChange({ ...sort, key: value as SortKey })
              }
              options={Object.entries(SORT_LABELS)}
            />
            <FilterSelect
              label="Order"
              value={sort.dir}
              onChange={(value) =>
                onSortChange({ ...sort, dir: value as SortDir })
              }
              options={[
                ["asc", "Ascending"],
                ["desc", "Descending"],
              ]}
            />
            <button
              type="button"
              onClick={() => {
                onClear();
                setMobileFiltersOpen(false);
              }}
              className="col-span-2 rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      <div className="hidden flex-col gap-2 px-3 py-2.5 md:flex">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Search symbols</span>
            <input
              type="search"
              value={query.query}
              onChange={(event) =>
                onQueryChange({ ...query, query: event.target.value })
              }
              placeholder="Search symbolâ€¦"
              aria-label="Search symbols"
              className="w-40 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40"
            />
          </label>

          <select
            aria-label="Filter by direction"
            value={query.direction}
            onChange={(event) =>
              onQueryChange({
                ...query,
                direction: event.target.value as DirectionFilter,
              })
            }
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-600"
          >
            <option value="ALL">Direction: all</option>
            <option value="LONG">LONG</option>
            <option value="SHORT">SHORT</option>
            <option value="NEUTRAL">NEUTRAL</option>
          </select>

          <select
            aria-label="Filter by freshness"
            value={query.freshness}
            onChange={(event) =>
              onQueryChange({
                ...query,
                freshness: event.target.value as FreshnessFilter,
              })
            }
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-600"
          >
            <option value="ALL">Freshness: all</option>
            <option value="FRESH">FRESH</option>
            <option value="DELAYED">DELAYED</option>
            <option value="STALE">STALE</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
              Sort
              <select
                aria-label="Sort by"
                value={sort.key}
                onChange={(event) =>
                  onSortChange({ ...sort, key: event.target.value as SortKey })
                }
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-600"
              >
                {Object.entries(SORT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-label={`Sort ${sort.dir === "asc" ? "ascending" : "descending"}`}
              onClick={() =>
                onSortChange({
                  ...sort,
                  dir: (sort.dir === "asc" ? "desc" : "asc") as SortDir,
                })
              }
              className="rounded border border-zinc-700 px-2 py-1 font-mono text-xs text-zinc-300 hover:bg-zinc-800"
            >
              {sort.dir === "asc" ? "â–²" : "â–¼"}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {stateChips.map((chip) => (
            <StateChip
              key={chip}
              chip={chip}
              active={query.state === chip}
              onClick={() => onQueryChange({ ...query, state: chip })}
            />
          ))}
          <span
            className="ml-auto font-mono text-[10px] text-zinc-600"
            aria-live="polite"
            title="Rows visible after filters"
          >
            {resultCount} shown
          </span>
        </div>
      </div>
    </div>
  );
}

function StateChip({
  chip,
  active,
  onClick,
  mobile = false,
}: {
  chip: StateFilter;
  active: boolean;
  onClick: () => void;
  mobile?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border font-mono font-medium uppercase tracking-[0.08em] transition-colors",
        mobile ? "h-7 px-2.5 text-[10px]" : "px-2 py-0.5 text-[10px]",
        active
          ? "border-emerald-600/60 bg-emerald-600/15 text-emerald-300"
          : "border-zinc-700 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
      )}
    >
      {STATE_FILTER_LABELS[chip]}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-zinc-100 outline-none focus:border-emerald-600"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}


========== src\components\scanner\scanner-empty-state.tsx ==========
/**
 * Scanner empty / unavailable states.
 *
 * One component, one explicit message per situation, so the dashboard never
 * shows a blank table with no explanation.
 */

import { cn } from "@/lib/utils";

export type EmptyKind =
  | "no-scan"
  | "no-results"
  | "no-matches"
  | "scan-error";

const COPY: Record<EmptyKind, { glyph: string; title: string; body: string; tone: string }> = {
  "no-scan": {
    glyph: "â—Œ",
    title: "No scan yet",
    body: "The scanner has not completed a cycle. Use Refresh to run the first analysis.",
    tone: "text-zinc-400",
  },
  "no-results": {
    glyph: "â—Œ",
    title: "No symbols scanned",
    body: "The configured universe produced no results. Check the scanner configuration.",
    tone: "text-zinc-400",
  },
  "no-matches": {
    glyph: "âŒ•",
    title: "No matching symbols",
    body: "No rows match the current search and filters. Clear them to see the full universe.",
    tone: "text-zinc-400",
  },
  "scan-error": {
    glyph: "âœ•",
    title: "Scanner unavailable",
    body: "The last scan cycle failed before results could be produced.",
    tone: "text-orange-300",
  },
};

export function ScannerEmptyState({
  kind,
  detail,
  onClearFilters,
  onRefresh,
}: {
  kind: EmptyKind;
  detail?: string | null;
  onClearFilters?: () => void;
  onRefresh?: () => void;
}) {
  const copy = COPY[kind];
  return (
    <div
      role="status"
      className={cn("flex flex-col items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 px-6 py-12 text-center")}
    >
      <span aria-hidden="true" className={cn("text-2xl", copy.tone)}>
        {copy.glyph}
      </span>
      <h3 className="text-sm font-semibold text-zinc-200">{copy.title}</h3>
      <p className="max-w-md text-xs text-zinc-500">{copy.body}</p>
      {detail && (
        <p className="max-w-md break-words font-mono text-[11px] text-orange-300/90">{detail}</p>
      )}
      <div className="mt-2 flex gap-2">
        {kind === "no-matches" && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Clear filters
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}


========== src\components\paper\paper-trading-overlay.tsx ==========
"use client";

import { useEffect, useState } from "react";
import {
  PaperTradingPanel,
  type PaperPanelView,
} from "@/components/paper/paper-trading-panel";
import type { PaperDashboardData } from "@/paper/types";

export function PaperTradingOverlay({
  open,
  view,
  paper,
  onClose,
  onReset,
  resetting,
  onClosePosition,
  onOpenAnalysis,
  closingPositionId,
  onSetInitialBalance,
  settingInitialBalance,
  externalError,
}: {
  open: boolean;
  view: Exclude<PaperPanelView, "both">;
  paper: PaperDashboardData | undefined;
  onClose: () => void;
  onReset: () => Promise<void>;
  resetting: boolean;
  onClosePosition?: (positionId: string) => Promise<void>;
  onOpenAnalysis?: (symbol: string) => void;
  closingPositionId?: string | null;
  onSetInitialBalance?: (initialBalance: number) => Promise<void>;
  settingInitialBalance?: boolean;
  /** Error surfaced by the parent overlay (reset / balance / close failures). */
  externalError?: string | null;
}) {
  const [activeView, setActiveView] = useState<Exclude<PaperPanelView, "both">>(
    view
  );

  useEffect(() => {
    if (!open) return;
    const syncView = window.setTimeout(() => setActiveView(view), 0);
    return () => window.clearTimeout(syncView);
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const title = "Paper Trading";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm md:items-center md:justify-center md:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-[#0b0e14] shadow-2xl md:max-w-5xl md:rounded-2xl">
        <header className="shrink-0 border-b border-zinc-800">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-zinc-100">{title}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                Simulated execution Â· no real funds
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              Close
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Paper trading views"
            className="grid grid-cols-2 border-t border-zinc-800 bg-zinc-950/35"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "portfolio"}
              onClick={() => setActiveView("portfolio")}
              className={
                "border-r border-zinc-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors " +
                (activeView === "portfolio"
                  ? "bg-emerald-950/20 text-emerald-300"
                  : "text-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-300")
              }
            >
              Portfolio
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "journal"}
              onClick={() => setActiveView("journal")}
              className={
                "px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors " +
                (activeView === "journal"
                  ? "bg-emerald-950/20 text-emerald-300"
                  : "text-zinc-600 hover:bg-zinc-900/60 hover:text-zinc-300")
              }
            >
              Journal
            </button>
          </div>
        </header>

        {externalError && (
          <div
            role="alert"
            className="shrink-0 border-b border-red-900/60 bg-red-950/20 px-3 py-2 text-[11px] text-red-200"
          >
            {externalError}
          </div>
        )}

        <div className="overflow-y-auto p-3 sm:p-4">
          <PaperTradingPanel
            paper={paper}
            onReset={onReset}
            resetting={resetting}
            onClosePosition={onClosePosition}
            onOpenAnalysis={onOpenAnalysis}
            closingPositionId={closingPositionId}
            onSetInitialBalance={onSetInitialBalance}
            settingInitialBalance={settingInitialBalance}
            view={activeView}
          />
        </div>
      </div>
    </div>
  );
}


========== src\components\paper\global-paper-trading-overlay.tsx ==========
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PaperTradingOverlay } from "@/components/paper/paper-trading-overlay";
import type { PaperDashboardData } from "@/paper/types";
import { apiFetch, ApiError } from "@/lib/api-client";

type PaperOverlayView = "portfolio" | "journal";
type PaperOverlayWindow = Window & {
  __fseOpenPaper?: (view: PaperOverlayView) => void;
};

export function GlobalPaperTradingOverlay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"portfolio" | "journal">("portfolio");
  const [paper, setPaper] = useState<PaperDashboardData | undefined>(undefined);
  const [resetting, setResetting] = useState(false);
  const [settingInitialBalance, setSettingInitialBalance] = useState(false);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const openPaperView = (nextView: PaperOverlayView = "portfolio") => {
      setView(nextView);
      setOpen(true);

      void apiFetch<PaperDashboardData>("/api/paper", {
        method: "GET",
        cache: "no-store",
        requireSecret: false,
      })
        .then((next) => setPaper(next))
        .catch(() => {
          // Keep the last good paper snapshot if refresh fails.
        });
    };

    const openPaperEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: PaperOverlayView }>).detail;
      openPaperView(detail?.view ?? "portfolio");
    };

    const browserWindow = window as PaperOverlayWindow;
    browserWindow.__fseOpenPaper = openPaperView;
    window.addEventListener("fse:open-paper", openPaperEvent);

    return () => {
      if (browserWindow.__fseOpenPaper === openPaperView) {
        delete browserWindow.__fseOpenPaper;
      }
      window.removeEventListener("fse:open-paper", openPaperEvent);
    };
  }, []);

  const resetPaper = async () => {
    if (resetting) return;
    if (!window.confirm("Reset all paper orders, positions, journal, and restore the current initial balance?")) return;

    setResetting(true);
    setError(null);
    try {
      const next = await apiFetch<PaperDashboardData>("/api/paper", {
        method: "DELETE",
        cache: "no-store",
      });
      setPaper(next);
    } catch (resetError) {
      if (resetError instanceof ApiError && resetError.code === "UNAUTHORIZED") {
        setError(
          "Approval secret is required to reset the paper account. Set it from the dialog, then try again."
        );
      } else {
        setError(
          resetError instanceof Error ? resetError.message : String(resetError)
        );
      }
    } finally {
      setResetting(false);
    }
  };

  const setInitialBalance = async (initialBalance: number) => {
    if (settingInitialBalance) return;
    const currency = paper?.account.currency ?? "USD";
    if (
      !window.confirm(
        `Set initial paper balance to ${currency} ${initialBalance.toLocaleString()}? This will clear all paper positions, orders, journal, and performance history.`
      )
    ) {
      return;
    }

    setSettingInitialBalance(true);
    setError(null);
    try {
      const next = await apiFetch<PaperDashboardData>("/api/paper", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-initial-balance",
          initialBalance,
        }),
      });
      setPaper(next);
    } catch (balanceError) {
      if (
        balanceError instanceof ApiError &&
        balanceError.code === "UNAUTHORIZED"
      ) {
        setError(
          "Approval secret is required to change the paper balance. Set it from the dialog, then try again."
        );
      } else {
        setError(
          balanceError instanceof Error
            ? balanceError.message
            : String(balanceError)
        );
      }
    } finally {
      setSettingInitialBalance(false);
    }
  };

  const openAnalysis = (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;

    setOpen(false);

    if (window.location.pathname === "/") {
      window.dispatchEvent(
        new CustomEvent("fse:open-signal-detail", {
          detail: { symbol: normalized },
        })
      );
      return;
    }

    window.sessionStorage.setItem("fse:open-signal-symbol", normalized);
    router.push("/#scanner");
  };

  const closePosition = async (positionId: string) => {
    if (closingPositionId) return;
    const position = paper?.openPositions.find((item) => item.id === positionId);
    if (!position) return;
    if (
      !window.confirm(
        `Close ${position.symbol} ${position.side} at the latest provider price?`
      )
    ) {
      return;
    }

    setClosingPositionId(positionId);
    setError(null);
    try {
      const next = await apiFetch<PaperDashboardData>("/api/paper", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close-position", positionId }),
      });
      setPaper(next);
    } catch (closeError) {
      if (closeError instanceof ApiError && closeError.code === "UNAUTHORIZED") {
        setError(
          "Approval secret is required to close a paper position. Set it from the dialog, then try again."
        );
      } else {
        setError(
          closeError instanceof Error ? closeError.message : String(closeError)
        );
      }
    } finally {
      setClosingPositionId(null);
    }
  };

  return (
    <PaperTradingOverlay
      open={open}
      view={view}
      paper={paper}
      onClose={() => setOpen(false)}
      onReset={resetPaper}
      resetting={resetting}
      onClosePosition={closePosition}
      onOpenAnalysis={openAnalysis}
      closingPositionId={closingPositionId}
      onSetInitialBalance={setInitialBalance}
      settingInitialBalance={settingInitialBalance}
      externalError={error}
    />
  );
}


========== src\components\paper\journal-workspace.tsx ==========
"use client";

import { useState } from "react";
import { PaperTradingPanel } from "@/components/paper/paper-trading-panel";
import type { PaperDashboardData } from "@/paper/types";
import { apiFetch, ApiError } from "@/lib/api-client";

export function JournalWorkspace({
  initialPaper,
}: {
  initialPaper?: PaperDashboardData;
}) {
  const [paper, setPaper] = useState(initialPaper);
  const [resetting, setResetting] = useState(false);
  const [settingInitialBalance, setSettingInitialBalance] = useState(false);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetPaper = async () => {
    if (resetting) return;
    if (!window.confirm("Reset all paper orders, positions, journal, and restore the current initial balance?")) return;

    setResetting(true);
    setError(null);
    try {
      const next = await apiFetch<PaperDashboardData>("/api/paper", {
        method: "DELETE",
        cache: "no-store",
      });
      setPaper(next);
    } catch (resetError) {
      if (resetError instanceof ApiError && resetError.code === "UNAUTHORIZED") {
        setError(
          "Approval secret is required to reset the paper account. Set it from the dialog, then try again."
        );
      } else {
        setError(
          resetError instanceof Error ? resetError.message : String(resetError)
        );
      }
    } finally {
      setResetting(false);
    }
  };

  const setInitialBalance = async (initialBalance: number) => {
    if (settingInitialBalance) return;
    const currency = paper?.account.currency ?? "USD";
    if (
      !window.confirm(
        `Set initial paper balance to ${currency} ${initialBalance.toLocaleString()}? This will clear all paper positions, orders, journal, and performance history.`
      )
    ) {
      return;
    }

    setSettingInitialBalance(true);
    setError(null);
    try {
      const next = await apiFetch<PaperDashboardData>("/api/paper", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-initial-balance",
          initialBalance,
        }),
      });
      setPaper(next);
    } catch (balanceError) {
      if (
        balanceError instanceof ApiError &&
        balanceError.code === "UNAUTHORIZED"
      ) {
        setError(
          "Approval secret is required to change the paper balance. Set it from the dialog, then try again."
        );
      } else {
        setError(
          balanceError instanceof Error
            ? balanceError.message
            : String(balanceError)
        );
      }
    } finally {
      setSettingInitialBalance(false);
    }
  };

  const closePosition = async (positionId: string) => {
    if (closingPositionId) return;
    const position = paper?.openPositions.find((item) => item.id === positionId);
    if (!position) return;
    if (
      !window.confirm(
        `Close ${position.symbol} ${position.side} at the latest provider price?`
      )
    ) {
      return;
    }

    setClosingPositionId(positionId);
    setError(null);
    try {
      const next = await apiFetch<PaperDashboardData>("/api/paper", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close-position", positionId }),
      });
      setPaper(next);
    } catch (closeError) {
      if (closeError instanceof ApiError && closeError.code === "UNAUTHORIZED") {
        setError(
          "Approval secret is required to close a paper position. Set it from the dialog, then try again."
        );
      } else {
        setError(
          closeError instanceof Error ? closeError.message : String(closeError)
        );
      }
    } finally {
      setClosingPositionId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:p-4 lg:p-5">
      <header>
        <p className="text-xs font-medium text-sky-300">Journal</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
          Paper portfolio & trading journal
        </h1>
        <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
          Review paper positions, orders, trades, and the execution audit trail.
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2.5 text-xs text-red-200">
          {error}
        </div>
      )}

      <PaperTradingPanel
        paper={paper}
        onReset={resetPaper}
        resetting={resetting}
        onClosePosition={closePosition}
        closingPositionId={closingPositionId}
        onSetInitialBalance={setInitialBalance}
        settingInitialBalance={settingInitialBalance}
      />
    </div>
  );
}


========== src\components\notifications\notification-panel.tsx ==========
"use client";

import type { NotificationDashboard } from "@/notifications/types";

export function NotificationPanel({
  notifications,
}: {
  notifications?: NotificationDashboard;
}) {
  if (!notifications) return null;

  const channelSummary = notifications.channels
    .filter((item) => item.enabled)
    .map((item) =>
      item.channel.toUpperCase() +
      (item.configured ? " READY" : " MISCONFIGURED")
    );

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-sky-400/80">
            Phase 11 Â· Realtime Alerts
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            Signal notification center
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Near-execute and lifecycle alerts are read-only consumers of engine output.
          </p>
        </div>
        <span
          className={
            "rounded border px-2 py-1 font-mono text-[8px] font-semibold " +
            (notifications.enabled
              ? "border-sky-800 bg-sky-950/20 text-sky-300"
              : "border-zinc-700 text-zinc-500")
          }
        >
          {notifications.enabled ? "ENABLED" : "OFF"}
        </span>
      </header>

      {notifications.error && (
        <div className="border-b border-amber-900/60 bg-amber-950/20 px-3 py-2 text-[9px] text-amber-300">
          Notification state warning: {notifications.error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 p-3 sm:grid-cols-4 lg:grid-cols-8">
        <Fact
          label="Channels"
          value={
            channelSummary.length > 0
              ? channelSummary.join(" Â· ")
              : "NONE"
          }
        />
        <Fact
          label="Pending"
          value={String(notifications.pendingDeliveries)}
        />
        <Fact
          label="Failed"
          value={String(notifications.failedDeliveries)}
        />
        <Fact
          label="Sent"
          value={String(notifications.sentDeliveries)}
        />
        <Fact
          label="Bias â‰¥"
          value={String(notifications.nearExecuteThresholds.biasScore)}
        />
        <Fact
          label="Setup â‰¥"
          value={String(notifications.nearExecuteThresholds.setupScore)}
        />
        <Fact
          label="Trigger â‰¥"
          value={String(notifications.nearExecuteThresholds.triggerScore)}
        />
        <Fact
          label="RR â‰¥"
          value={notifications.nearExecuteThresholds.minRiskReward.toFixed(2)}
        />
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div>
          <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Recent alerts
          </h3>
          {notifications.recentEvents.length === 0 ? (
            <p className="mt-2 rounded border border-zinc-800 bg-zinc-950/45 px-3 py-3 text-[9px] text-zinc-600">
              No alert event has been recorded yet.
            </p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {notifications.recentEvents.slice(0, 10).map((event) => (
                <div
                  key={event.id}
                  className="grid gap-1 rounded border border-zinc-800 bg-zinc-950/45 px-2.5 py-2 sm:grid-cols-[105px_92px_minmax(0,1fr)] sm:items-center"
                >
                  <span className={"font-mono text-[8px] " + stateTone(event.state)}>
                    {event.state}
                  </span>
                  <span className="font-mono text-[8px] text-zinc-400">
                    {event.symbol} {event.direction}
                  </span>
                  <span className="truncate text-[9px] text-zinc-600" title={event.message}>
                    {event.status} Â· {event.sentChannels.join(", ") || "not sent"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-2">
          {notifications.channels.map((channel) => (
            <section
              key={channel.channel}
              className="rounded border border-zinc-800 bg-zinc-950/45 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  {channel.channel}
                </h3>
                <span
                  className={
                    "font-mono text-[8px] " +
                    (!channel.enabled
                      ? "text-zinc-600"
                      : channel.configured
                        ? "text-emerald-300"
                        : "text-amber-300")
                  }
                >
                  {!channel.enabled
                    ? "OFF"
                    : channel.configured
                      ? "READY"
                      : "SETUP"}
                </span>
              </div>
              <p className="mt-1 text-[9px] leading-relaxed text-zinc-600">
                {channel.message}
              </p>
            </section>
          ))}
        </aside>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <dt className="text-[7px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-[9px] text-zinc-300" title={value}>
        {value}
      </dd>
    </div>
  );
}

function stateTone(state: string): string {
  if (state === "EXECUTE_READY") return "text-red-300";
  if (state === "NEAR_EXECUTE") return "text-amber-300";
  if (state === "INVALIDATED" || state === "BLOCKED") {
    return "text-zinc-400";
  }
  return "text-sky-300";
}


========== src\components\backtest\backtest-workspace.tsx ==========
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BacktestRunArtifact, BacktestRunListItem } from "@/replay/backtest-run-types";
import type { HistoricalDatasetValidation } from "@/replay/import-types";
import { ValidationWorkbench } from "@/components/backtest/validation-workbench";
import { apiFetch, ApiError } from "@/lib/api-client";

type ApiRunResponse =
  | { ok: true; artifact: BacktestRunArtifact }
  | {
      ok: false;
      error: string;
      validation?: HistoricalDatasetValidation;
    };

export function BacktestWorkspace() {
  const [files, setFiles] = useState<File[]>([]);
  const [datasetId, setDatasetId] = useState("mt5-validation");
  const [source, setSource] = useState("MT5 historical export");
  const [utcOffsetMinutes, setUtcOffsetMinutes] = useState("0");
  const [spreadPips, setSpreadPips] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialBalance, setInitialBalance] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("0.5");
  const [maxOpenPositions, setMaxOpenPositions] = useState("10");
  const [maxTotalRisk, setMaxTotalRisk] = useState("5");
  const [policy, setPolicy] = useState("STOP_FIRST");
  const [running, setRunning] = useState(false);
  const [artifact, setArtifact] = useState<BacktestRunArtifact | null>(null);
  const [validation, setValidation] =
    useState<HistoricalDatasetValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<BacktestRunListItem[]>([]);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);

  const totalBytes = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  );

  const refreshRecent = async () => {
    try {
      const response = await fetch("/api/backtest/runs?limit=10", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        ok: boolean;
        runs?: BacktestRunListItem[];
      };
      if (payload.ok && payload.runs) setRecentRuns(payload.runs);
    } catch {
      // Recent runs are secondary; a listing failure must not block new runs.
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshRecent();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  const runBacktest = async () => {
    if (running || files.length === 0) return;
    setRunning(true);
    setError(null);
    setValidation(null);

    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      form.set("datasetId", datasetId);
      form.set("source", source);
      form.set("sourceUtcOffsetMinutes", utcOffsetMinutes);
      form.set("assumedSpreadPips", spreadPips);
      form.set("initialBalance", initialBalance);
      form.set("riskPercent", riskPercent);
      form.set("maxOpenPositions", maxOpenPositions);
      form.set("maxTotalOpenRiskPercent", maxTotalRisk);
      form.set("intrabarConflictPolicy", policy);
      form.set("maxReplaySteps", "50000");
      if (startDate) form.set("startAt", startDate);
      if (endDate) form.set("endAt", endDate);

      // apiFetch attaches the approval secret when available. A 4xx/5xx
      // throws an ApiError whose .body still carries the structured payload
      // so the validation issues survive the migration.
      const payload = await apiFetch<ApiRunResponse>("/api/backtest/run", {
        method: "POST",
        body: form,
        cache: "no-store",
      });

      if (!payload.ok) {
        setError(payload.error);
        setValidation(payload.validation ?? null);
        return;
      }

      setArtifact(payload.artifact);
      setValidation(payload.artifact.validation);
      await refreshRecent();
    } catch (runError) {
      if (runError instanceof ApiError) {
        if (runError.code === "UNAUTHORIZED") {
          setError(
            "Approval secret is required to run a backtest. Set it from the dialog, then try again."
          );
          return;
        }
        const body = runError.body as ApiRunResponse | null;
        if (body && body.ok === false) {
          setError(body.error);
          setValidation(body.validation ?? null);
          return;
        }
        setError(runError.message);
        return;
      }
      setError(
        runError instanceof Error ? runError.message : String(runError)
      );
    } finally {
      setRunning(false);
    }
  };

  const loadPersistedRun = async (id: string) => {
    if (loadingRunId) return;
    setLoadingRunId(id);
    setError(null);
    try {
      const response = await fetch("/api/backtest/runs/" + encodeURIComponent(id), {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { ok: true; artifact: BacktestRunArtifact }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Unable to load report." : payload.error);
        return;
      }
      setArtifact(payload.artifact);
      setValidation(payload.artifact.validation);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError)
      );
    } finally {
      setLoadingRunId(null);
    }
  };

  const exportReport = () => {
    if (!artifact) return;
    const blob = new Blob([JSON.stringify(artifact, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.id + ".json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 pb-20 sm:p-4 md:pb-4">
      <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
        <header className="border-b border-zinc-800 px-3 py-3">
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">
            Phase 5.9 Â· Strategy Version Registry
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
                Historical backtest
              </h1>
              <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
                Import and validate historical data, complete human evidence review, and register immutable validated strategy versions without changing strategy logic.
              </p>
            </div>
            <Link
              href="/#overview"
              className="rounded border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              â† Live scanner
            </Link>
          </div>
        </header>

        <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="space-y-3">
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                1 Â· Historical files
              </h2>
              <label className="mt-2 block cursor-pointer rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 p-4 text-center transition-colors hover:border-emerald-800">
                <input
                  type="file"
                  multiple
                  accept=".csv,.txt,text/csv,text/plain"
                  className="sr-only"
                  onChange={(event) =>
                    setFiles(Array.from(event.target.files ?? []))
                  }
                />
                <span className="block text-sm font-medium text-zinc-200">
                  Select MT5 CSV/TXT files
                </span>
                <span className="mt-1 block text-[10px] leading-relaxed text-zinc-600">
                  File name must include symbol + timeframe, e.g. EURUSD_D1.csv, EURUSD_H4.csv, EURUSD_H1.csv, EURUSD_M15.csv.
                </span>
              </label>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                <span>{files.length} files</span>
                <span>{formatBytes(totalBytes)}</span>
                <span>D1 Â· H4 Â· H1 Â· M15 required per pair</span>
              </div>

              {files.length > 0 && (
                <div className="mt-2 max-h-28 overflow-auto rounded border border-zinc-800 bg-zinc-950/30 p-2">
                  <div className="grid gap-1 font-mono text-[9px] text-zinc-500 sm:grid-cols-2">
                    {files.map((file) => (
                      <div key={file.name} className="truncate">
                        {file.name} Â· {formatBytes(file.size)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="border-t border-zinc-800 pt-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                2 Â· Source normalization
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Field label="Dataset id">
                  <input
                    value={datasetId}
                    onChange={(event) => setDatasetId(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Source label">
                  <input
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Source UTC offset Â· minutes"
                  hint="120 = UTC+2, 180 = UTC+3. MT5 export often uses broker-server time."
                >
                  <input
                    type="number"
                    min={-840}
                    max={840}
                    step={30}
                    value={utcOffsetMinutes}
                    onChange={(event) => setUtcOffsetMinutes(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Assumed spread Â· pips"
                  hint="Deterministic static assumption; no random spread."
                >
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={spreadPips}
                    onChange={(event) => setSpreadPips(event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </section>

            <section className="border-t border-zinc-800 pt-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                3 Â· Replay window & risk
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Start date" hint="Blank = common coverage start">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="End date" hint="Blank = common coverage end">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Initial balance">
                  <input
                    type="number"
                    min={1}
                    value={initialBalance}
                    onChange={(event) => setInitialBalance(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Risk / trade Â· %">
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    value={riskPercent}
                    onChange={(event) => setRiskPercent(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Max open positions">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxOpenPositions}
                    onChange={(event) => setMaxOpenPositions(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Max total risk Â· %">
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={maxTotalRisk}
                    onChange={(event) => setMaxTotalRisk(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Same-bar SL/TP"
                  hint="STOP_FIRST is the conservative default."
                >
                  <select
                    value={policy}
                    onChange={(event) => setPolicy(event.target.value)}
                    className={inputClass}
                  >
                    <option value="STOP_FIRST">STOP_FIRST</option>
                    <option value="TARGET_FIRST">TARGET_FIRST</option>
                    <option value="REJECT_AMBIGUOUS">REJECT_AMBIGUOUS</option>
                  </select>
                </Field>
              </div>
            </section>

            <div className="border-t border-zinc-800 pt-3">
              <button
                type="button"
                disabled={running || files.length === 0}
                onClick={runBacktest}
                className="w-full rounded-md border border-emerald-700/70 bg-emerald-950/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-300 transition-colors hover:bg-emerald-900/30 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                {running ? "Validating & replayingâ€¦" : "Validate & run backtest"}
              </button>
              <p className="mt-1.5 text-[9px] text-zinc-600">
                Synchronous safety limit: 50,000 M15 replay steps. Narrow the date range for larger datasets.
              </p>
            </div>
          </div>

          <RecentRuns
            runs={recentRuns}
            loadingRunId={loadingRunId}
            onLoad={loadPersistedRun}
          />
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-800/60 bg-red-950/20 px-3 py-2 text-xs text-red-200"
        >
          <span className="font-mono font-semibold">BACKTEST BLOCKED</span>
          <span className="ml-2 text-red-200/75">{error}</span>
        </div>
      )}

      {validation && <ValidationPanel validation={validation} />}

      {artifact && (
        <>
          <BacktestResultHeader artifact={artifact} onExport={exportReport} />
          <BacktestMetrics artifact={artifact} />
          <EquityCurve artifact={artifact} />
          <ValidationWorkbench
            key={artifact.id}
            artifact={artifact}
            recentRuns={recentRuns}
            onArtifactUpdated={(next) => {
              setArtifact(next);
              setValidation(next.validation);
            }}
            onRecentRunsRefresh={refreshRecent}
          />
        </>
      )}
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-xs text-zinc-200 outline-none transition-colors focus:border-emerald-700 focus:ring-1 focus:ring-emerald-800";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-[9px] font-normal normal-case tracking-normal text-zinc-700">
          {hint}
        </span>
      )}
    </label>
  );
}

function ValidationPanel({
  validation,
}: {
  validation: HistoricalDatasetValidation;
}) {
  const errors = validation.issues.filter((issue) => issue.severity === "ERROR");
  const warnings = validation.issues.filter(
    (issue) => issue.severity === "WARNING"
  );

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Dataset validation</h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {validation.importedFileCount} files Â· {validation.importedSymbolCount} symbols Â· {validation.importedSeriesCount} series
          </p>
        </div>
        <span
          className={
            "rounded border px-2 py-1 font-mono text-[9px] font-semibold " +
            (validation.valid
              ? "border-emerald-800 bg-emerald-950/30 text-emerald-300"
              : "border-red-800 bg-red-950/30 text-red-300")
          }
        >
          {validation.valid ? "VALID" : "BLOCKED"}
        </span>
      </header>

      <div className="grid gap-3 p-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <dl className="grid grid-cols-2 gap-2 text-[10px]">
          <DataItem label="UTC offset" value={formatOffset(validation.sourceUtcOffsetMinutes)} />
          <DataItem label="Spread" value={validation.assumedSpreadPips + " pips"} />
          <DataItem label="Common start" value={formatUtc(validation.commonStartAt)} />
          <DataItem label="Common end" value={formatUtc(validation.commonEndAt)} />
          <DataItem
            label="Est. M15 steps"
            value={
              validation.estimatedM15Steps === null
                ? "â€”"
                : validation.estimatedM15Steps.toLocaleString()
            }
          />
          <DataItem
            label="Issues"
            value={errors.length + " errors Â· " + warnings.length + " warnings"}
          />
        </dl>

        <div className="min-w-0">
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full min-w-[620px] text-left text-[10px]">
              <thead className="bg-zinc-950/70 text-zinc-600">
                <tr>
                  <th className="px-2 py-1.5">Series</th>
                  <th className="px-2 py-1.5">Candles</th>
                  <th className="px-2 py-1.5">Start</th>
                  <th className="px-2 py-1.5">End</th>
                  <th className="px-2 py-1.5">Gaps</th>
                </tr>
              </thead>
              <tbody>
                {validation.series.map((row) => (
                  <tr
                    key={row.symbol + row.timeframe}
                    className="border-t border-zinc-800 text-zinc-400"
                  >
                    <td className="px-2 py-1.5 font-mono text-zinc-200">
                      {row.symbol} Â· {row.timeframe}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{row.candleCount.toLocaleString()}</td>
                    <td className="px-2 py-1.5 font-mono">{formatUtc(row.startAt)}</td>
                    <td className="px-2 py-1.5 font-mono">{formatUtc(row.endAt)}</td>
                    <td className="px-2 py-1.5 font-mono">{row.nonWeekendGapCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validation.issues.length > 0 && (
            <details className="mt-2 rounded border border-zinc-800 bg-zinc-950/30">
              <summary className="cursor-pointer px-2.5 py-2 text-[10px] font-medium text-zinc-400">
                Validation issues ({validation.issues.length})
              </summary>
              <div className="max-h-48 space-y-1 overflow-auto border-t border-zinc-800 p-2">
                {validation.issues.map((issue, index) => (
                  <div
                    key={issue.code + index}
                    className={
                      "text-[9px] leading-relaxed " +
                      (issue.severity === "ERROR"
                        ? "text-red-300"
                        : issue.severity === "WARNING"
                          ? "text-amber-300"
                          : "text-zinc-500")
                    }
                  >
                    <span className="font-mono font-semibold">{issue.severity} Â· {issue.code}</span>
                    {" Â· "}
                    {issue.message}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}

function BacktestResultHeader({
  artifact,
  onExport,
}: {
  artifact: BacktestRunArtifact;
  onExport: () => void;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/30 px-3 py-2.5">
      <div>
        <p className="font-mono text-[9px] text-zinc-600">{artifact.id}</p>
        <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
          {artifact.metadata?.label || "Validation report"}
        </h2>
        {artifact.metadata?.tags && artifact.metadata.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {artifact.metadata.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-zinc-800 px-1 py-0.5 font-mono text-[8px] text-zinc-600"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-1 text-[10px] text-zinc-500">
          {artifact.validation.symbols.join(", ")} Â· {formatUtc(artifact.config.startAt)} â†’ {formatUtc(artifact.config.endAt)} Â· {(artifact.durationMs / 1000).toFixed(1)}s
        </p>
      </div>
      <button
        type="button"
        onClick={onExport}
        className="rounded border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 hover:border-emerald-800 hover:text-emerald-300"
      >
        Export JSON
      </button>
    </section>
  );
}

function BacktestMetrics({ artifact }: { artifact: BacktestRunArtifact }) {
  const analytics = artifact.analytics;
  const metrics = [
    ["Trades", analytics.sampleSize.toLocaleString()],
    ["Win rate", formatPercent(analytics.winRate)],
    ["Net return", signedPercent(analytics.netReturnPercent)],
    ["Profit factor", formatNumber(analytics.profitFactor, 2)],
    ["Expectancy R", formatSigned(analytics.expectancyR, 2)],
    ["Avg R", formatSigned(analytics.averageR, 2)],
    ["Max equity DD", formatPercent(analytics.maxEquityDrawdownPercent)],
    ["Net P/L", formatSigned(analytics.netPnL, 2)],
  ];

  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 sm:grid-cols-4 xl:grid-cols-8">
      {metrics.map(([label, value]) => (
        <div key={label} className="bg-[#0f131b] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.1em] text-zinc-600">
            {label}
          </div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-zinc-200">
            {value}
          </div>
        </div>
      ))}
    </section>
  );
}

function EquityCurve({ artifact }: { artifact: BacktestRunArtifact }) {
  const points = artifact.analytics.equityCurve;
  if (points.length < 2) {
    return (
      <section className="rounded-md border border-zinc-800 bg-zinc-900/30 p-3 text-xs text-zinc-600">
        Equity curve needs at least two replay marks.
      </section>
    );
  }

  const width = 1000;
  const height = 220;
  const pad = 12;
  const values = points.map((point) => point.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-9, max - min);
  const firstAt = points[0].asOf;
  const lastAt = points[points.length - 1].asOf;
  const timeRange = Math.max(1, lastAt - firstAt);

  const path = points
    .map((point, index) => {
      const x =
        pad + ((point.asOf - firstAt) / timeRange) * (width - pad * 2);
      const y =
        height -
        pad -
        ((point.equity - min) / range) * (height - pad * 2);
      return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Equity curve</h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Mark-to-market replay equity Â· includes floating P/L
          </p>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">
          {formatNumber(min, 2)} â†’ {formatNumber(max, 2)}
        </span>
      </header>
      <div className="overflow-hidden p-2">
        <svg
          viewBox={"0 0 " + width + " " + height}
          role="img"
          aria-label="Historical mark-to-market equity curve"
          className="h-48 w-full"
          preserveAspectRatio="none"
        >
          <line
            x1={pad}
            y1={height / 2}
            x2={width - pad}
            y2={height / 2}
            stroke="rgb(63 63 70)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke="rgb(52 211 153)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </section>
  );
}

function RecentRuns({
  runs,
  loadingRunId,
  onLoad,
}: {
  runs: BacktestRunListItem[];
  loadingRunId: string | null;
  onLoad: (id: string) => void;
}) {
  return (
    <aside className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/30">
      <header className="border-b border-zinc-800 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
          Recent reports
        </h2>
        <p className="mt-0.5 text-[9px] text-zinc-700">
          Persisted separately under .data/backtest-runs
        </p>
      </header>
      <div className="max-h-[430px] space-y-1.5 overflow-auto p-2">
        {runs.length === 0 ? (
          <div className="px-2 py-6 text-center text-[10px] text-zinc-700">
            No persisted backtest reports yet.
          </div>
        ) : (
          runs.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onLoad(run.id)}
              disabled={loadingRunId !== null}
              className="w-full rounded border border-zinc-800 bg-zinc-900/30 p-2 text-left hover:border-zinc-700 hover:bg-zinc-900/60 disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] font-semibold text-zinc-300">
                  {run.label || run.datasetId}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {run.releaseDecision && (
                    <span className="rounded border border-zinc-800 px-1 py-0.5 font-mono text-[8px] text-zinc-500">
                      {run.releaseDecision}
                    </span>
                  )}
                  <span className="font-mono text-[9px] text-zinc-600">
                    N {run.sampleSize}
                  </span>
                </div>
              </div>
              {run.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {run.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-zinc-800 px-1 py-0.5 font-mono text-[8px] text-zinc-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-zinc-600">
                <span>{run.symbols.join(", ")}</span>
                <span>{signedPercent(run.netReturnPercent)}</span>
                <span>DD {formatPercent(run.maxDrawdownPercent)}</span>
                <span>E[R] {formatSigned(run.expectancyR, 2)}</span>
              </div>
              <div className="mt-1 font-mono text-[8px] text-zinc-700">
                {loadingRunId === run.id ? "Loadingâ€¦" : formatUtc(run.completedAt)}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/30 px-2 py-1.5">
      <dt className="text-[8px] uppercase tracking-[0.1em] text-zinc-700">{label}</dt>
      <dd className="mt-0.5 font-mono text-[10px] text-zinc-300">{value}</dd>
    </div>
  );
}

function formatUtc(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "â€”";
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  return "UTC" + sign + hours + (mins ? ":" + String(mins).padStart(2, "0") : "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "â€”" : value.toFixed(digits);
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "â€”" : value.toFixed(2) + "%";
}

function signedPercent(value: number): string {
  if (!Number.isFinite(value)) return "â€”";
  return (value > 0 ? "+" : "") + value.toFixed(2) + "%";
}

function formatSigned(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return "â€”";
  return (value > 0 ? "+" : "") + value.toFixed(digits);
}


========== src\components\backtest\release-gate-workbench.tsx ==========
"use client";

import { useMemo, useState } from "react";
import type { HistoricalForwardComparison } from "@/replay/analytics-types";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  buildReleaseEvidenceReview,
  buildReleaseGateAuditRecord,
  isReleaseReviewCurrent,
} from "@/replay/release-gate";
import type {
  ForwardEvidenceReviewState,
  ReleaseDecision,
  ReleaseReviewChecklist,
} from "@/replay/release-gate-types";
import { apiFetch, ApiError } from "@/lib/api-client";

const EMPTY_CHECKLIST: ReleaseReviewChecklist = {
  datasetQualityReviewed: false,
  assumptionsReviewed: false,
  reproducibilityReviewed: false,
  outOfSampleReviewed: false,
  statisticsReviewed: false,
  forwardPaper: "NOT_REVIEWED",
};

export function ReleaseGateWorkbench({
  artifact,
  forwardComparison,
  onArtifactUpdated,
  onRecentRunsRefresh,
}: {
  artifact: BacktestRunArtifact;
  forwardComparison: HistoricalForwardComparison | null;
  onArtifactUpdated: (artifact: BacktestRunArtifact) => void;
  onRecentRunsRefresh: () => Promise<void>;
}) {
  const stored = artifact.releaseReview;
  const [reviewer, setReviewer] = useState(stored?.reviewer ?? "");
  const [note, setNote] = useState(stored?.note ?? "");
  const [decision, setDecision] = useState<ReleaseDecision>(
    stored?.decision ?? "PENDING"
  );
  const [checklist, setChecklist] = useState<ReleaseReviewChecklist>(
    stored?.checklist ? { ...stored.checklist } : { ...EMPTY_CHECKLIST }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evidence = useMemo(
    () =>
      buildReleaseEvidenceReview(artifact, {
        forwardEvidenceAvailable: forwardComparison !== null,
      }),
    [artifact, forwardComparison]
  );
  const current = useMemo(() => isReleaseReviewCurrent(artifact), [artifact]);

  const exportAuditRecord = () => {
    const record = buildReleaseGateAuditRecord(artifact);
    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.id + "-release-gate.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const saveReview = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const forwardEvidence =
        checklist.forwardPaper === "REVIEWED"
          ? forwardComparison
            ? { capturedAt: Date.now(), comparison: forwardComparison }
            : stored?.forwardEvidence ?? null
          : null;

      const payload = await apiFetch<
        | { ok: true; artifact: BacktestRunArtifact }
        | { ok: false; error: string }
      >(
        "/api/backtest/runs/" + encodeURIComponent(artifact.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            releaseReview: {
              decision,
              reviewer,
              note,
              checklist,
              forwardEvidence,
            },
          }),
        }
      );
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      onArtifactUpdated(payload.artifact);
      await onRecentRunsRefresh();
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.code === "UNAUTHORIZED") {
        setError(
          "Approval secret is required to save the release review. Set it from the dialog, then try again."
        );
        return;
      }
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
      <ReleaseGateHeader
        artifact={artifact}
        fingerprint={evidence.fingerprint}
        current={current}
        onExport={exportAuditRecord}
      />
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <EvidenceMatrix evidence={evidence} current={current} artifact={artifact} />
        <ReviewForm
          reviewer={reviewer}
          note={note}
          decision={decision}
          checklist={checklist}
          saving={saving}
          error={error}
          onReviewer={setReviewer}
          onNote={setNote}
          onDecision={setDecision}
          onChecklist={setChecklist}
          onSave={saveReview}
        />
      </div>
    </section>
  );
}


function ReleaseGateHeader({
  artifact,
  fingerprint,
  current,
  onExport,
}: {
  artifact: BacktestRunArtifact;
  fingerprint: string;
  current: boolean;
  onExport: () => void;
}) {
  const state =
    artifact.releaseReview === undefined
      ? "UNREVIEWED"
      : current
        ? artifact.releaseReview.decision
        : "STALE";

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-sky-400/80">
          Phase 5.8
        </p>
        <h3 className="mt-0.5 text-xs font-semibold text-zinc-300">
          Validation evidence & release gate
        </h3>
        <p className="mt-0.5 max-w-3xl text-[9px] leading-relaxed text-zinc-700">
          Evidence status is descriptive. The stored release decision is entered manually by a reviewer.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[8px] font-semibold text-zinc-400">
          {state}
        </span>
        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[8px] text-zinc-600">
          FP {fingerprint}
        </span>
        <button
          type="button"
          onClick={onExport}
          className="rounded border border-zinc-700 px-2 py-1 font-mono text-[8px] text-zinc-500 hover:border-sky-800 hover:text-sky-300"
        >
          Export gate JSON
        </button>
      </div>
    </header>
  );
}

function EvidenceMatrix({
  evidence,
  current,
  artifact,
}: {
  evidence: ReturnType<typeof buildReleaseEvidenceReview>;
  current: boolean;
  artifact: BacktestRunArtifact;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label="Satisfied" value={evidence.counts.SATISFIED} />
        <Count label="Attention" value={evidence.counts.ATTENTION} />
        <Count label="Missing" value={evidence.counts.MISSING} />
        <Count label="Info" value={evidence.counts.INFO} />
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        {evidence.items.map((item) => (
          <div
            key={item.id}
            className="grid gap-2 border-t border-zinc-800 bg-zinc-950/40 px-3 py-2 first:border-t-0 sm:grid-cols-[130px_150px_minmax(0,1fr)] sm:items-center"
          >
            <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-zinc-700">
              {item.category}
            </div>
            <div>
              <span className="inline-flex rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-zinc-400">
                {item.status}
              </span>
              <div className="mt-1 text-[9px] font-medium text-zinc-400">
                {item.label}
              </div>
            </div>
            <p className="text-[9px] leading-relaxed text-zinc-600">
              {item.detail}
            </p>
          </div>
        ))}
      </div>

      {artifact.releaseReview && !current && (
        <div className="rounded border border-red-900/70 bg-red-950/20 px-3 py-2 text-[9px] leading-relaxed text-red-300">
          Stored review fingerprint no longer matches this report. Review again before relying on the stored decision.
        </div>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 px-2.5 py-2">
      <div className="text-[8px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-300">
        {value}
      </div>
    </div>
  );
}


function ReviewForm({
  reviewer,
  note,
  decision,
  checklist,
  saving,
  error,
  onReviewer,
  onNote,
  onDecision,
  onChecklist,
  onSave,
}: {
  reviewer: string;
  note: string;
  decision: ReleaseDecision;
  checklist: ReleaseReviewChecklist;
  saving: boolean;
  error: string | null;
  onReviewer: (value: string) => void;
  onNote: (value: string) => void;
  onDecision: (value: ReleaseDecision) => void;
  onChecklist: (value: ReleaseReviewChecklist) => void;
  onSave: () => Promise<void>;
}) {
  const toggle = (
    key: Exclude<keyof ReleaseReviewChecklist, "forwardPaper">
  ) => {
    onChecklist({ ...checklist, [key]: !checklist[key] });
  };

  return (
    <aside className="rounded border border-zinc-800 bg-zinc-950/50">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h4 className="text-[10px] font-semibold text-zinc-400">
          Manual reviewer checklist
        </h4>
        <p className="mt-0.5 text-[8px] text-zinc-700">
          A checked item means it was reviewed, not that the evidence was favorable.
        </p>
      </header>

      <div className="space-y-2.5 p-3">
        <ReviewCheck
          label="Dataset quality / import warnings reviewed"
          checked={checklist.datasetQualityReviewed}
          onChange={() => toggle("datasetQualityReviewed")}
        />
        <ReviewCheck
          label="Execution assumptions reviewed"
          checked={checklist.assumptionsReviewed}
          onChange={() => toggle("assumptionsReviewed")}
        />
        <ReviewCheck
          label="Reproducibility fingerprint reviewed"
          checked={checklist.reproducibilityReviewed}
          onChange={() => toggle("reproducibilityReviewed")}
        />
        <ReviewCheck
          label="OOS / sequential evidence reviewed"
          checked={checklist.outOfSampleReviewed}
          onChange={() => toggle("outOfSampleReviewed")}
        />
        <ReviewCheck
          label="Statistical diagnostics / warnings reviewed"
          checked={checklist.statisticsReviewed}
          onChange={() => toggle("statisticsReviewed")}
        />

        <label className="block text-[8px] font-medium uppercase tracking-[0.08em] text-zinc-700">
          Forward Paper evidence
          <select
            value={checklist.forwardPaper}
            onChange={(event) =>
              onChecklist({
                ...checklist,
                forwardPaper: event.target.value as ForwardEvidenceReviewState,
              })
            }
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[9px] text-zinc-400 outline-none focus:border-sky-800"
          >
            <option value="NOT_REVIEWED">NOT_REVIEWED</option>
            <option value="REVIEWED">REVIEWED</option>
            <option value="WAIVED">WAIVED</option>
          </select>
          <span className="mt-1 block font-normal normal-case tracking-normal text-zinc-700">
            REVIEWED requires a captured Paper comparison. WAIVED records an explicit reviewer choice to proceed without one.
          </span>
        </label>

        <label className="block text-[8px] font-medium uppercase tracking-[0.08em] text-zinc-700">
          Reviewer
          <input
            value={reviewer}
            maxLength={80}
            onChange={(event) => onReviewer(event.target.value)}
            placeholder="Name / reviewer id"
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[10px] normal-case tracking-normal text-zinc-300 outline-none focus:border-sky-800"
          />
        </label>

        <label className="block text-[8px] font-medium uppercase tracking-[0.08em] text-zinc-700">
          Reviewer note
          <textarea
            value={note}
            maxLength={2000}
            rows={4}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Document concerns, caveats, reasons or next-stage conditions."
            className="mt-1 w-full resize-y rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[10px] normal-case tracking-normal text-zinc-300 outline-none focus:border-sky-800"
          />
        </label>

        <label className="block text-[8px] font-medium uppercase tracking-[0.08em] text-zinc-700">
          Reviewer decision
          <select
            value={decision}
            onChange={(event) =>
              onDecision(event.target.value as ReleaseDecision)
            }
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-[10px] font-semibold text-zinc-300 outline-none focus:border-sky-800"
          >
            <option value="PENDING">PENDING</option>
            <option value="HOLD">HOLD</option>
            <option value="PROMOTE">PROMOTE</option>
          </select>
        </label>

        {error && (
          <div
            role="alert"
            className="rounded border border-red-900/70 bg-red-950/20 px-2.5 py-2 text-[9px] leading-relaxed text-red-300"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="w-full rounded border border-sky-800/70 bg-sky-950/20 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-sky-300 hover:bg-sky-900/25 disabled:opacity-50"
        >
          {saving ? "Saving reviewâ€¦" : "Save release review"}
        </button>

        <p className="text-[8px] leading-relaxed text-zinc-700">
          PROMOTE requires all core checklist items and Forward Paper marked REVIEWED or WAIVED. Evidence warnings remain visible and do not become an automatic decision.
        </p>
      </div>
    </aside>
  );
}

function ReviewCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded border border-zinc-800 bg-zinc-950/45 px-2.5 py-2 text-[9px] text-zinc-500">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-sky-500"
      />
      <span>{label}</span>
    </label>
  );
}


========== src\components\backtest\strategy-version-registry-workbench.tsx ==========
"use client";

import { useEffect, useMemo, useState } from "react";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import { isReleaseReviewCurrent } from "@/replay/release-gate";
import type {
  StrategyVersionEntry,
  StrategyVersionRegistry,
} from "@/replay/strategy-version-types";
import { apiFetch, ApiError } from "@/lib/api-client";

export function StrategyVersionRegistryWorkbench({
  artifact,
}: {
  artifact: BacktestRunArtifact;
}) {
  const [registry, setRegistry] = useState<StrategyVersionRegistry | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState(artifact.metadata?.label ?? "");
  const [note, setNote] = useState("");
  const [registeredBy, setRegisteredBy] = useState(
    artifact.releaseReview?.reviewer ?? ""
  );
  const [supersedesVersion, setSupersedesVersion] = useState("");
  const [deprecatingVersion, setDeprecatingVersion] = useState<string | null>(
    null
  );
  const [deprecateBy, setDeprecateBy] = useState(
    artifact.releaseReview?.reviewer ?? ""
  );
  const [deprecateReason, setDeprecateReason] = useState("");
  const [rollingBackVersion, setRollingBackVersion] = useState<string | null>(
    null
  );
  const [rollbackBy, setRollbackBy] = useState(
    artifact.releaseReview?.reviewer ?? ""
  );
  const [rollbackReason, setRollbackReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const response = await fetch("/api/backtest/strategy-versions", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Unable to read registry." : payload.error);
      }
      setRegistry(payload.registry);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError)
      );
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeVersion = useMemo(
    () =>
      registry?.entries.find((entry) => entry.currentStatus === "ACTIVE")
        ?.manifest.version ?? null,
    [registry]
  );

  const eligible =
    artifact.releaseReview?.decision === "PROMOTE" &&
    isReleaseReviewCurrent(artifact);

  const register = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string }
      >("/api/backtest/strategy-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          title,
          note,
          registeredBy,
          sourceReportId: artifact.id,
          ...(supersedesVersion ? { supersedesVersion } : {}),
        }),
      });
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      setRegistry(payload.registry);
      setVersion("");
      setNote("");
      setSupersedesVersion("");
    } catch (registerError) {
      if (
        registerError instanceof ApiError &&
        registerError.code === "UNAUTHORIZED"
      ) {
        setError(
          "Approval secret is required to register a strategy version. Set it from the dialog, then try again."
        );
        return;
      }
      setError(
        registerError instanceof Error
          ? registerError.message
          : String(registerError)
      );
    } finally {
      setLoading(false);
    }
  };

  const rollback = async () => {
    if (!rollingBackVersion || loading) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string }
      >(
        "/api/backtest/strategy-versions/" +
          encodeURIComponent(rollingBackVersion),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ROLLBACK",
            changedBy: rollbackBy,
            reason: rollbackReason,
          }),
        }
      );
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      setRegistry(payload.registry);
      setRollingBackVersion(null);
      setRollbackReason("");
    } catch (rollbackError) {
      if (
        rollbackError instanceof ApiError &&
        rollbackError.code === "UNAUTHORIZED"
      ) {
        setError(
          "Approval secret is required to rollback. Set it from the dialog, then try again."
        );
        return;
      }
      setError(
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError)
      );
    } finally {
      setLoading(false);
    }
  };

  const deprecate = async () => {
    if (!deprecatingVersion || loading) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string }
      >(
        "/api/backtest/strategy-versions/" +
          encodeURIComponent(deprecatingVersion),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "DEPRECATE",
            changedBy: deprecateBy,
            reason: deprecateReason,
          }),
        }
      );
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      setRegistry(payload.registry);
      setDeprecatingVersion(null);
      setDeprecateReason("");
    } catch (deprecateError) {
      if (
        deprecateError instanceof ApiError &&
        deprecateError.code === "UNAUTHORIZED"
      ) {
        setError(
          "Approval secret is required to deprecate. Set it from the dialog, then try again."
        );
        return;
      }
      setError(
        deprecateError instanceof Error
          ? deprecateError.message
          : String(deprecateError)
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-emerald-400/80">
            Phase 6.5 Â· Release Governance
          </p>
          <h3 className="mt-0.5 text-xs font-semibold text-zinc-300">
            Strategy version registry
          </h3>
          <p className="mt-0.5 max-w-3xl text-[9px] leading-relaxed text-zinc-700">
            Immutable validated manifests with explicit supersession, controlled rollback and deprecation history.
          </p>
        </div>
        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[8px] text-zinc-500">
          {registry?.entries.length ?? 0} registered
        </span>
      </header>

      <div className="grid gap-3 p-3 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
          <h4 className="text-[10px] font-semibold text-zinc-400">
            Register promoted strategy
          </h4>
          <p className="mt-1 text-[8px] leading-relaxed text-zinc-700">
            Registration freezes the current strategy/scanner baseline together with its validation and release-gate evidence.
          </p>

          <div className="mt-3 space-y-2.5">
            <Field label="Version">
              <input
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="v1.0.0"
                className={inputClass}
              />
            </Field>
            <Field label="Title">
              <input
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Validated baseline"
                className={inputClass}
              />
            </Field>
            <Field label="Registered by">
              <input
                value={registeredBy}
                maxLength={80}
                onChange={(event) => setRegisteredBy(event.target.value)}
                className={inputClass}
              />
            </Field>

            {activeVersion && (
              <Field
                label="Explicit supersession"
                hint={
                  "Current ACTIVE is " +
                  activeVersion +
                  ". Select it explicitly to replace it."
                }
              >
                <select
                  value={supersedesVersion}
                  onChange={(event) =>
                    setSupersedesVersion(event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="">Do not supersede</option>
                  <option value={activeVersion}>
                    Supersede {activeVersion}
                  </option>
                </select>
              </Field>
            )}

            <Field label="Registry note">
              <textarea
                value={note}
                rows={4}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why this version is being registered."
                className={inputClass + " resize-y"}
              />
            </Field>

            {!eligible && (
              <div className="rounded border border-amber-900/60 bg-amber-950/20 px-2.5 py-2 text-[9px] leading-relaxed text-amber-300">
                Current report is not eligible. Save a current Phase 5.8 manual PROMOTE review first.
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded border border-red-900/60 bg-red-950/20 px-2.5 py-2 text-[9px] leading-relaxed text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={!eligible || loading}
              onClick={register}
              className="w-full rounded border border-emerald-800/70 bg-emerald-950/20 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-300 hover:bg-emerald-900/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Savingâ€¦" : "Register immutable version"}
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          {!registry || registry.entries.length === 0 ? (
            <div className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-8 text-center text-[10px] text-zinc-700">
              No strategy versions registered yet.
            </div>
          ) : (
            <div className="space-y-2">
              {registry.entries.map((entry) => (
                <VersionCard
                  key={entry.manifest.version}
                  entry={entry}
                  deprecating={deprecatingVersion === entry.manifest.version}
                  rollingBack={rollingBackVersion === entry.manifest.version}
                  deprecateBy={deprecateBy}
                  deprecateReason={deprecateReason}
                  rollbackBy={rollbackBy}
                  rollbackReason={rollbackReason}
                  disabled={loading}
                  onStartDeprecate={() => {
                    setRollingBackVersion(null);
                    setDeprecatingVersion(entry.manifest.version);
                    setDeprecateReason("");
                  }}
                  onStartRollback={() => {
                    setDeprecatingVersion(null);
                    setRollingBackVersion(entry.manifest.version);
                    setRollbackReason("");
                  }}
                  onCancelDeprecate={() => setDeprecatingVersion(null)}
                  onCancelRollback={() => setRollingBackVersion(null)}
                  onDeprecateBy={setDeprecateBy}
                  onDeprecateReason={setDeprecateReason}
                  onRollbackBy={setRollbackBy}
                  onRollbackReason={setRollbackReason}
                  onConfirmDeprecate={deprecate}
                  onConfirmRollback={rollback}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[10px] normal-case tracking-normal text-zinc-300 outline-none focus:border-emerald-800";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[8px] font-medium uppercase tracking-[0.08em] text-zinc-700">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block font-normal normal-case tracking-normal text-zinc-700">
          {hint}
        </span>
      )}
    </label>
  );
}

function VersionCard({
  entry,
  deprecating,
  rollingBack,
  deprecateBy,
  deprecateReason,
  rollbackBy,
  rollbackReason,
  disabled,
  onStartDeprecate,
  onStartRollback,
  onCancelDeprecate,
  onCancelRollback,
  onDeprecateBy,
  onDeprecateReason,
  onRollbackBy,
  onRollbackReason,
  onConfirmDeprecate,
  onConfirmRollback,
}: {
  entry: StrategyVersionEntry;
  deprecating: boolean;
  rollingBack: boolean;
  deprecateBy: string;
  deprecateReason: string;
  rollbackBy: string;
  rollbackReason: string;
  disabled: boolean;
  onStartDeprecate: () => void;
  onStartRollback: () => void;
  onCancelDeprecate: () => void;
  onCancelRollback: () => void;
  onDeprecateBy: (value: string) => void;
  onDeprecateReason: (value: string) => void;
  onRollbackBy: (value: string) => void;
  onRollbackReason: (value: string) => void;
  onConfirmDeprecate: () => Promise<void>;
  onConfirmRollback: () => Promise<void>;
}) {
  const manifest = entry.manifest;

  const exportManifest = () => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = manifest.version + "-strategy-manifest.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="rounded border border-zinc-800 bg-zinc-950/45">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-200">
              {manifest.version}
            </span>
            <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-zinc-400">
              {entry.currentStatus}
            </span>
          </div>
          <h4 className="mt-1 text-[10px] font-medium text-zinc-400">
            {manifest.title}
          </h4>
          <p className="mt-0.5 font-mono text-[8px] text-zinc-700">
            FP {manifest.manifestFingerprint} Â· report {manifest.sourceReportId}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={exportManifest}
            className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-emerald-800 hover:text-emerald-300"
          >
            Export manifest
          </button>
          {entry.currentStatus === "SUPERSEDED" && (
            <button
              type="button"
              disabled={disabled}
              onClick={onStartRollback}
              className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-sky-800 hover:text-sky-300 disabled:opacity-40"
            >
              Rollback
            </button>
          )}
          {entry.currentStatus !== "DEPRECATED" && (
            <button
              type="button"
              disabled={disabled}
              onClick={onStartDeprecate}
              className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-amber-800 hover:text-amber-300 disabled:opacity-40"
            >
              Deprecate
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-2 px-3 py-2 sm:grid-cols-4">
        <Fact label="Registered" value={shortUtc(manifest.registeredAt)} />
        <Fact label="By" value={manifest.registeredBy} />
        <Fact label="Release reviewer" value={manifest.releaseReviewer} />
        <Fact label="Symbols" value={manifest.symbols.join(", ")} />
      </div>

      <details className="border-t border-zinc-800">
        <summary className="cursor-pointer px-3 py-2 text-[9px] text-zinc-600">
          Lifecycle & validation identity
        </summary>
        <div className="grid gap-3 border-t border-zinc-800 p-3 lg:grid-cols-2">
          <div className="space-y-1">
            {entry.statusHistory.map((event, index) => (
              <div
                key={event.changedAt + "-" + index}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[8px] text-zinc-600"
              >
                <span className="font-mono font-semibold text-zinc-400">
                  {event.status}
                </span>
                {" Â· "}
                {shortUtc(event.changedAt)}
                {" Â· "}
                {event.changedBy}
                <div className="mt-0.5 text-zinc-700">{event.reason}</div>
              </div>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <Fact label="Validation FP" value={manifest.reproducibility.combined} />
            <Fact label="Assumption FP" value={manifest.reproducibility.assumptions} />
            <Fact
              label="Trigger score"
              value={String(
                manifest.strategySnapshot.engineConfig.trigger.minTriggerScore
              )}
            />
            <Fact
              label="Setup score"
              value={String(
                manifest.strategySnapshot.engineConfig.setup.minSetupScore
              )}
            />
          </dl>
        </div>
      </details>

      {rollingBack && (
        <div className="space-y-2 border-t border-zinc-800 bg-sky-950/10 p-3">
          <p className="text-[9px] text-sky-300">
            Controlled rollback reactivates this immutable SUPERSEDED manifest and supersedes the current ACTIVE release.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={rollbackBy}
              maxLength={80}
              onChange={(event) => onRollbackBy(event.target.value)}
              placeholder="Changed by"
              className={inputClass}
            />
            <input
              value={rollbackReason}
              maxLength={1000}
              onChange={(event) => onRollbackReason(event.target.value)}
              placeholder="Rollback reason"
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onConfirmRollback()}
              className="rounded border border-sky-800 px-2.5 py-1.5 text-[8px] font-semibold text-sky-300 disabled:opacity-40"
            >
              Confirm rollback
            </button>
            <button
              type="button"
              onClick={onCancelRollback}
              className="rounded border border-zinc-800 px-2.5 py-1.5 text-[8px] text-zinc-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {deprecating && (
        <div className="space-y-2 border-t border-zinc-800 bg-amber-950/10 p-3">
          <p className="text-[9px] text-amber-300">
            Deprecation is append-only and does not delete or alter this manifest.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={deprecateBy}
              maxLength={80}
              onChange={(event) => onDeprecateBy(event.target.value)}
              placeholder="Changed by"
              className={inputClass}
            />
            <input
              value={deprecateReason}
              maxLength={1000}
              onChange={(event) => onDeprecateReason(event.target.value)}
              placeholder="Deprecation reason"
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onConfirmDeprecate()}
              className="rounded border border-amber-800 px-2.5 py-1.5 text-[8px] font-semibold text-amber-300 disabled:opacity-40"
            >
              Confirm deprecate
            </button>
            <button
              type="button"
              onClick={onCancelDeprecate}
              className="rounded border border-zinc-800 px-2.5 py-1.5 text-[8px] text-zinc-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
      <dt className="text-[7px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-[8px] text-zinc-400">
        {value || "â€”"}
      </dd>
    </div>
  );
}

function shortUtc(value: number): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}


========== src\components\system\system-workspace.tsx ==========
import { BrokerExecutionPanel } from "@/components/broker/broker-execution-panel";
import { ForwardValidationPanel } from "@/components/forward-validation/forward-validation-panel";
import { ProductionHealthPanel } from "@/components/production/production-health-panel";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { TransitionHistory } from "@/components/signals/transition-history";
import type { DashboardData } from "@/types/dashboard";

export function SystemWorkspace({ data }: { data: DashboardData }) {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-3 sm:p-4 lg:p-5">
      <header className="mb-1">
        <p className="text-xs font-medium text-sky-300">System</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
          Health, safety & diagnostics
        </h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500 sm:text-sm">
          Operational infrastructure is separated from the trading workspace so system detail stays available without competing with market decisions.
        </p>
      </header>

      {data.releaseRuntime && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/25 p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Strategy runtime</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-3">
            <Fact label="Status" value={data.releaseRuntime.status} />
            <Fact label="Version" value={data.releaseRuntime.version ?? "UNVERSIONED"} />
            <Fact label="Pinned" value={data.releaseRuntime.pinned ? "YES" : "NO"} />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            {data.releaseRuntime.message}
          </p>
        </section>
      )}

      <ProductionHealthPanel />
      <BrokerExecutionPanel broker={data.broker} />
      <NotificationPanel notifications={data.notifications} />
      <ForwardValidationPanel />

      <details className="rounded-lg border border-zinc-800 bg-zinc-900/25">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-200">
          <span className="flex items-center justify-between">
            Recent signal transitions
            <span aria-hidden="true" className="text-zinc-600">â€º</span>
          </span>
        </summary>
        <div className="border-t border-zinc-800 p-4">
          <TransitionHistory
            transitions={data.recentTransitions}
            emptyLabel="No state transitions have been recorded yet."
          />
        </div>
      </details>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-[#0b0e14] px-3 py-2.5">
      <dt className="text-[11px] text-zinc-600">{label}</dt>
      <dd className="mt-1 font-mono text-xs text-zinc-200">{value}</dd>
    </div>
  );
}


========== src\components\system\system-status-panel.tsx ==========
import { systemConfig } from "@/config/system";
import { cn } from "@/lib/utils";

/**
 * Placeholder system-status panel.
 *
 * Deliberately minimal: professional dashboard UI arrives in Phase 3. This only
 * proves that config -> UI wiring works and the app boots.
 */
const rows = [
  { label: "System Status", value: systemConfig.status },
  { label: "Core Engine", value: systemConfig.coreEngine },
  { label: "Market Scanner", value: systemConfig.marketScanner },
  { label: "Execution Mode", value: systemConfig.executionMode },
] as const;

export function SystemStatusPanel() {
  return (
    <section
      aria-label="System status"
      className="w-full max-w-md rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h1 className="text-center text-xl font-bold tracking-tight sm:text-2xl">
        FOREX SIGNAL ENGINE
      </h1>
      <dl className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 py-3 text-sm"
          >
            <dt className="text-zinc-600 dark:text-zinc-400">{row.label}:</dt>
            <dd
              className={cn(
                "font-mono font-medium",
                row.value === "SIGNAL ONLY" && "text-amber-600 dark:text-amber-400"
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}


========== src\components\production\production-health-panel.tsx ==========
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductionHealthSnapshot } from "@/production/health-types";

export function ProductionHealthPanel() {
  const [health, setHealth] = useState<ProductionHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/system/health", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | ProductionHealthSnapshot
        | { error?: string };
      if (
        !("protocol" in payload) ||
        payload.protocol !== "phase-11-health-v1"
      ) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Production health payload is invalid."
        );
      }
      setHealth(payload);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError)
      );
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const warnings =
    health?.checks.filter((item) => item.status !== "PASS") ?? [];
  const persistenceIssues =
    health?.persistence.filter(
      (item) => item.state !== "VERIFIED" && item.state !== "MISSING"
    ) ?? [];

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-violet-400/80">
            System Health
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            Alerts, execution safety & infrastructure
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Alerts, broker safety, shared state and deployment readiness.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-violet-800 hover:text-violet-300 disabled:opacity-40"
        >
          {loading ? "Checkingâ€¦" : "Refresh"}
        </button>
      </header>

      {error && (
        <div className="border-b border-red-900/60 bg-red-950/20 px-3 py-2 text-[9px] text-red-300">
          {error}
        </div>
      )}

      {!health ? (
        <div className="px-3 py-5 text-center text-[10px] text-zinc-700">
          Reading production healthâ€¦
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 p-3 sm:grid-cols-4 lg:grid-cols-8">
            <Fact label="Readiness" value={health.readiness} tone={health.readiness} />
            <Fact label="Execution" value={health.executionMode} />
            <Fact label="Broker" value={health.broker.providerId.toUpperCase()} />
            <Fact label="Infra" value={health.infrastructure.mode} />
            <Fact label="Provider" value={health.providerId.toUpperCase()} />
            <Fact label="Provider state" value={health.provider.state} />
            <Fact
              label="Strategy"
              value={health.releaseRuntime.version ?? health.releaseRuntime.status}
            />
            <Fact
              label="Uptime"
              value={formatUptime(health.uptimeSeconds)}
            />
          </div>

          <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_310px]">
            <div className="space-y-1.5">
              {health.checks.map((check) => (
                <div
                  key={check.id}
                  className="grid gap-1 rounded border border-zinc-800 bg-zinc-950/45 px-2.5 py-2 sm:grid-cols-[80px_minmax(0,1fr)] sm:items-center"
                >
                  <span
                    className={
                      "w-fit rounded border px-1.5 py-0.5 font-mono text-[8px] font-semibold " +
                      checkTone(check.status)
                    }
                  >
                    {check.status}
                  </span>
                  <span className="text-[9px] leading-relaxed text-zinc-500">
                    {check.message}
                  </span>
                </div>
              ))}
            </div>

            <aside className="space-y-2">
              <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
                <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  Safety
                </h3>
                <dl className="mt-2 grid grid-cols-2 gap-2">
                  <Fact
                    label="Maintenance"
                    value={health.safety.maintenanceMode ? "ON" : "OFF"}
                  />
                  <Fact
                    label="Active required"
                    value={health.safety.requireActiveRelease ? "YES" : "NO"}
                  />
                  <Fact
                    label="Live data required"
                    value={health.safety.requireLiveMarketData ? "YES" : "NO"}
                  />
                  <Fact
                    label="Startup recovery"
                    value={health.startupRecovery.blocking ? "BLOCKED" : "OK"}
                  />
                  <Fact
                    label="Shared required"
                    value={
                      health.safety.requireSharedTransactionalStore
                        ? "YES"
                        : "NO"
                    }
                  />
                  <Fact
                    label="TX latency"
                    value={
                      health.infrastructure.transactional
                        ? health.infrastructure.transactional.latencyMs + "ms"
                        : "LOCAL"
                    }
                  />
                  <Fact
                    label="Env stop"
                    value={
                      health.safety.liveEmergencyStop
                        ? "ENGAGED"
                        : "OPEN"
                    }
                  />
                  <Fact
                    label="Kill switch"
                    value={
                      health.broker.controls.killSwitchEngaged
                        ? "ENGAGED"
                        : "OPEN"
                    }
                  />
                  <Fact
                    label="Live arm"
                    value={
                      health.broker.controls.liveArm
                        ? health.broker.controls.liveArm.remainingOrders + " LEFT"
                        : "NONE"
                    }
                  />
                  <Fact
                    label="Reconcile"
                    value={String(health.broker.unresolvedCount)}
                  />
                  <Fact
                    label="Alerts"
                    value={health.notifications.enabled ? "ON" : "OFF"}
                  />
                  <Fact
                    label="Alert fail"
                    value={String(health.notifications.failedDeliveries)}
                  />
                </dl>
              </section>

              <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
                <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  Persistence
                </h3>
                <div className="mt-2 text-[9px] text-zinc-600">
                  {health.persistence.length} inspected Â· {persistenceIssues.length} attention
                </div>
                {persistenceIssues.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {persistenceIssues.slice(0, 4).map((item) => (
                      <div
                        key={item.path}
                        className="truncate font-mono text-[8px] text-amber-300/80"
                        title={item.path + " Â· " + item.message}
                      >
                        {item.state} Â· {basename(item.path)}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {warnings.length === 0 && (
                <p className="rounded border border-emerald-900/50 bg-emerald-950/15 px-3 py-2 text-[9px] leading-relaxed text-emerald-300/80">
                  No readiness warnings are currently reported.
                </p>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: ProductionHealthSnapshot["readiness"];
}) {
  const valueClass =
    tone === "READY"
      ? "text-emerald-300"
      : tone === "DEGRADED"
        ? "text-amber-300"
        : tone === "BLOCKED"
          ? "text-red-300"
          : "text-zinc-300";

  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <dt className="text-[7px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </dt>
      <dd className={"mt-0.5 truncate font-mono text-[9px] " + valueClass}>
        {value}
      </dd>
    </div>
  );
}

function checkTone(status: "PASS" | "WARN" | "FAIL"): string {
  if (status === "PASS") {
    return "border-emerald-900 bg-emerald-950/25 text-emerald-300";
  }
  if (status === "WARN") {
    return "border-amber-900 bg-amber-950/25 text-amber-300";
  }
  return "border-red-900 bg-red-950/25 text-red-300";
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return seconds + "s";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m";
  return Math.floor(seconds / 3600) + "h";
}

function basename(value: string): string {
  return value.replace(/\\/g, "/").split("/").at(-1) ?? value;
}


========== src\components\forward-validation\forward-validation-panel.tsx ==========
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ForwardValidationReport,
  ForwardValidationSnapshot,
} from "@/forward-validation/types";

export function ForwardValidationPanel() {
  const [report, setReport] = useState<ForwardValidationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/forward-validation", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { ok: true; report: ForwardValidationSnapshot }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "Forward validation refresh failed." : payload.error
        );
      }
      setReport(payload.report);
      setError(null);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError)
      );
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const exportReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      report.status === "NO_ACTIVE_RELEASE"
        ? "forward-validation.json"
        : report.release.version +
          "-" +
          report.release.activationAt +
          "-forward-validation.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      id="forward-validation"
      className="scroll-mt-16 rounded-md border border-zinc-800 bg-zinc-900/30"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">
            Forward Validation
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            Runtime drift monitor
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Release-scoped Paper evidence vs the immutable historical validation reference.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {report && (
            <button
              type="button"
              onClick={exportReport}
              className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-cyan-800 hover:text-cyan-300"
            >
              Export JSON
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void refresh()}
            className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-cyan-800 hover:text-cyan-300 disabled:opacity-40"
          >
            {loading ? "Readingâ€¦" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-900/60 bg-red-950/20 px-3 py-2 text-[9px] text-red-300">
          {error}
        </div>
      )}

      {!report ? (
        <div className="px-3 py-5 text-center text-[10px] text-zinc-700">
          Loading forward validation evidenceâ€¦
        </div>
      ) : report.status === "NO_ACTIVE_RELEASE" ? (
        <div className="px-3 py-5 text-center">
          <div className="font-mono text-[10px] font-semibold text-amber-300">
            NO ACTIVE RELEASE
          </div>
          <p className="mx-auto mt-1 max-w-xl text-[9px] leading-relaxed text-zinc-600">
            {report.message}
          </p>
        </div>
      ) : (
        <ForwardReport report={report} />
      )}
    </section>
  );
}

function ForwardReport({ report }: { report: ForwardValidationReport }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 p-3 sm:grid-cols-4 lg:grid-cols-6">
        <Fact label="State" value={report.status} />
        <Fact label="Release" value={report.release.version} />
        <Fact label="Forward trades" value={String(report.sample.tradeCount)} />
        <Fact
          label="Window trades"
          value={String(report.monitoringWindow.tradeCount)}
        />
        <Fact
          label="Observations"
          value={String(report.operational.observationCount)}
        />
        <Fact
          label="Window obs"
          value={String(report.monitoringWindow.observationCount)}
        />
        <Fact
          label="Span"
          value={report.operational.calendarSpanDays.toFixed(1) + "d"}
        />
        <Fact
          label="Activation"
          value={shortUtc(report.release.activationAt)}
        />
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="overflow-hidden rounded border border-zinc-800">
          {report.indicators.map((item) => (
            <div
              key={item.id}
              className="grid gap-1.5 border-t border-zinc-800 bg-zinc-950/35 px-3 py-2 first:border-t-0 sm:grid-cols-[125px_minmax(0,1fr)_140px] sm:items-center"
            >
              <span
                className={
                  "w-fit rounded border px-1.5 py-0.5 font-mono text-[8px] font-semibold " +
                  indicatorTone(item.status)
                }
              >
                {item.status}
              </span>
              <div>
                <div className="text-[9px] font-medium text-zinc-400">
                  {item.label}
                </div>
                <p className="mt-0.5 text-[8px] leading-relaxed text-zinc-700">
                  {item.detail}
                </p>
              </div>
              <div className="font-mono text-[8px] text-zinc-600">
                <div>FWD {formatValue(item.forwardValue, item.unit)}</div>
                {(item.referenceLow !== null ||
                  item.referenceHigh !== null) && (
                  <div className="mt-0.5">
                    REF{" "}
                    {item.referenceLow === null
                      ? "â‰¤ "
                      : formatValue(item.referenceLow, item.unit) + " â€“ "}
                    {item.referenceHigh === null
                      ? "â€”"
                      : formatValue(item.referenceHigh, item.unit)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <aside className="space-y-2">
          <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              Evidence counts
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <Fact
                label="Within ref"
                value={String(report.counts.withinReference)}
              />
              <Fact
                label="Outside ref"
                value={String(report.counts.outsideReference)}
              />
              <Fact
                label="Attention"
                value={String(report.counts.attention)}
              />
              <Fact
                label="Insufficient"
                value={String(report.counts.insufficient)}
              />
            </dl>
          </section>

          <section className="rounded border border-zinc-800 bg-zinc-950/45 p-3">
            <h3 className="text-[9px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              Operational sample
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <Fact
                label="Provider fail"
                value={
                  report.operational.providerFailureRatePercent.toFixed(2) + "%"
                }
              />
              <Fact
                label="Stale data"
                value={
                  report.operational.staleDataRatePercent.toFixed(2) + "%"
                }
              />
              <Fact
                label="Paper fills"
                value={String(report.operational.paperFilledCount)}
              />
              <Fact
                label="Paper rejects"
                value={String(report.operational.paperRejectedCount)}
              />
            </dl>
          </section>

          <section className="rounded border border-zinc-800 bg-zinc-950/45 px-3 py-2">
            <div className="text-[8px] uppercase tracking-[0.08em] text-zinc-700">
              Manifest fingerprint
            </div>
            <div className="mt-1 break-all font-mono text-[8px] text-zinc-500">
              {report.release.manifestFingerprint}
            </div>
            <p className="mt-2 text-[8px] leading-relaxed text-zinc-700">
              Drift indicators use the recent monitoring window; cumulative forward metrics remain in the exported report. Phase 7 never changes parameters, promotes a version, or triggers rollback automatically.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
      <dt className="text-[7px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-[9px] text-zinc-300">
        {value}
      </dd>
    </div>
  );
}

function indicatorTone(status: string): string {
  if (status === "WITHIN_REFERENCE") {
    return "border-emerald-900 bg-emerald-950/25 text-emerald-300";
  }
  if (status === "OUTSIDE_REFERENCE" || status === "ATTENTION") {
    return "border-amber-900 bg-amber-950/25 text-amber-300";
  }
  if (status === "INSUFFICIENT_DATA") {
    return "border-sky-900 bg-sky-950/25 text-sky-300";
  }
  return "border-zinc-800 bg-zinc-950 text-zinc-500";
}

function formatValue(
  value: number | null,
  unit: "%" | "R" | "COUNT" | "RATIO"
): string {
  if (value === null || !Number.isFinite(value)) return "â€”";
  if (unit === "%") return value.toFixed(2) + "%";
  if (unit === "R") return value.toFixed(2) + "R";
  if (unit === "COUNT") return String(Math.round(value));
  return value.toFixed(2);
}

function shortUtc(value: number): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + "Z";
}


========== src\components\analytics\signal-funnel-panel.tsx ==========
"use client";

import { useMemo, useState } from "react";
import {
  SIGNAL_FUNNEL_STAGES,
  type SignalFunnelDashboard,
  type SignalFunnelStage,
  type SignalFunnelWindow,
} from "@/analytics/signal-funnel";

const STAGE_LABELS: Record<SignalFunnelStage, string> = {
  SCANNED: "Scanned",
  DATA_VALID: "Data valid",
  BIAS_DIRECTIONAL: "Directional bias",
  SETUP_ACTIONABLE: "Setup actionable",
  TRIGGER_CONFIRMED: "Trigger confirmed",
  RISK_APPROVED: "Risk approved",
  NO_HARD_VETO: "No hard veto",
  EXECUTE: "Execute",
};

const WINDOWS: SignalFunnelWindow[] = ["24H", "7D", "30D"];

export function SignalFunnelPanel({
  analytics,
  persistenceError,
  onReset,
  resetting = false,
}: {
  analytics: SignalFunnelDashboard | null | undefined;
  persistenceError?: string | null;
  /** Optional reset handler. When provided, a Reset button is rendered. */
  onReset?: () => void;
  /** True while a reset request is in flight. Disables the button. */
  resetting?: boolean;
}) {
  const [windowKey, setWindowKey] = useState<SignalFunnelWindow>("24H");
  const summary = analytics?.windows[windowKey] ?? null;

  const executeRate = useMemo(() => {
    if (!summary || summary.observations === 0) return 0;
    return Math.round((summary.executions / summary.observations) * 10000) / 100;
  }, [summary]);

  if (!summary) {
    return null;
  }

  return (
    <section
      id="analytics"
      aria-labelledby="signal-funnel-title"
      className="scroll-mt-20 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/25"
    >
      <header className="flex flex-col gap-3 border-b border-zinc-800 px-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div>
          <h2 id="signal-funnel-title" className="text-base font-semibold text-zinc-100">
            Signal Funnel + Rejection Analytics
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Observability only â€” shows where opportunities are being filtered without changing strategy decisions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex w-fit rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5">
          {WINDOWS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setWindowKey(item)}
              className={
                item === windowKey
                  ? "rounded px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-950/40"
                  : "rounded px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300"
              }
            >
              {item}
            </button>
          ))}
        </div>
          {onReset && (
            <button
              type="button"
              disabled={resetting}
              onClick={onReset}
              className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-red-800/60 hover:bg-red-950/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetting ? "Resetting..." : "Reset"}
            </button>
          )}
        </div>
      </header>

      {persistenceError && (
        <div
          role="alert"
          className="border-b border-amber-900/50 bg-amber-950/15 px-3 py-2 text-xs text-amber-200 sm:px-4"
        >
          Analytics persistence warning: {persistenceError}
        </div>
      )}

      <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Observations" value={summary.observations.toLocaleString()} />
            <Metric label="Executions" value={summary.executions.toLocaleString()} />
            <Metric label="Execute rate" value={`${executeRate}%`} />
          </div>

          <div className="overflow-hidden rounded-md border border-zinc-800/80">
            <div className="grid grid-cols-[minmax(120px,1fr)_70px_80px_70px] border-b border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              <span>Stage</span>
              <span className="text-right">Passed</span>
              <span className="text-right">Conv.</span>
              <span className="text-right">Drop</span>
            </div>
            {SIGNAL_FUNNEL_STAGES.map((stage) => {
              const stat = summary.stageStats.find((item) => item.stage === stage);
              if (!stat) return null;
              return (
                <div
                  key={stage}
                  className="grid grid-cols-[minmax(120px,1fr)_70px_80px_70px] items-center border-b border-zinc-800/60 px-3 py-2.5 text-xs last:border-b-0"
                >
                  <span className="truncate font-medium text-zinc-300">
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="text-right font-mono tabular-nums text-zinc-200">
                    {stat.count}
                  </span>
                  <span className="text-right font-mono tabular-nums text-zinc-500">
                    {stat.conversionRate === null ? "â€”" : `${stat.conversionRate}%`}
                  </span>
                  <span
                    className={
                      stat.dropOff > 0
                        ? "text-right font-mono tabular-nums text-amber-300"
                        : "text-right font-mono tabular-nums text-zinc-600"
                    }
                  >
                    {stat.dropOff > 0 ? `-${stat.dropOff}` : "â€”"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-md border border-zinc-800/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Top rejection reasons
              </h3>
              <span className="text-[10px] text-zinc-600">share of rejections</span>
            </div>
            {summary.rejectionReasons.length === 0 ? (
              <p className="py-3 text-xs text-zinc-600">No rejected observations in this window.</p>
            ) : (
              <div className="space-y-2">
                {summary.rejectionReasons.slice(0, 8).map((reason) => (
                  <div key={reason.code} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-zinc-300">
                        {reason.code}
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        {STAGE_LABELS[reason.stage]}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-xs tabular-nums text-zinc-200">{reason.count}</p>
                      <p className="font-mono text-[10px] tabular-nums text-zinc-600">
                        {reason.percentage}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-800/80 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Strategy routing
            </h3>
            {summary.strategyRoutingStats.length === 0 ? (
              <p className="py-2 text-xs text-zinc-600">No strategy routing observations yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.strategyRoutingStats.slice(0, 8).map((item) => (
                  <div
                    key={`${item.preferredStrategyId}|${item.selectedStrategyId}|${item.routingMode}`}
                    className="grid grid-cols-[minmax(0,1fr)_60px] gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-zinc-300">
                        {item.preferredStrategyId} â†’ {item.selectedStrategyId}
                      </p>
                      <p className="truncate text-[10px] text-zinc-600">
                        {item.routingMode} Â· {item.executionRate}% exec
                      </p>
                    </div>
                    <span className="text-right font-mono tabular-nums text-zinc-300">
                      {item.observations}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-800/80 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Regime distribution
            </h3>
            {summary.regimeStats.length === 0 ? (
              <p className="py-2 text-xs text-zinc-600">No regime observations yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.regimeStats.slice(0, 8).map((item) => (
                  <div
                    key={item.regime}
                    className="grid grid-cols-[minmax(0,1fr)_60px_68px] items-center gap-2 text-[11px]"
                  >
                    <span className="truncate text-zinc-400">{item.regime}</span>
                    <span className="text-right font-mono tabular-nums text-zinc-300">
                      {item.observations}
                    </span>
                    <span className="text-right font-mono tabular-nums text-zinc-600">
                      {item.executionRate}% exec
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-950/25 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-zinc-200">{value}</p>
    </div>
  );
}


========== src\components\common\badges.tsx ==========
/**
 * Status badges.
 *
 * Every badge renders a TEXT LABEL and a glyph together with its tone, so a
 * status is never communicated by color alone. All values come from the
 * engine's own enums; badges never compute or reinterpret a result.
 */

import { cn } from "@/lib/utils";
import {
  TONE_CLASSES,
  type Tone,
  BIAS_DISPLAY,
  biasTone,
  DECISION_META,
  DIRECTION_META,
  FRESHNESS_META,
  REGIME_DISPLAY,
  regimeTone,
  SETUP_STATE_META,
  SIGNAL_STATE_META,
  TRIGGER_STATE_META,
} from "@/lib/signal-meta";
import type {
  BiasLabel,
  Direction,
  ExecutionDecision,
  RegimeLabel,
  SetupState,
  SignalState,
  TriggerState,
} from "@/types/market";
import type { FreshnessStatus } from "@/types/market-data";
import { NOT_AVAILABLE } from "@/lib/format";

export function Badge({
  tone,
  glyph,
  children,
  className,
  title,
}: {
  tone: Tone;
  glyph?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5",
        "font-mono text-[10px] font-semibold uppercase tracking-wide",
        TONE_CLASSES[tone],
        className
      )}
      title={title}
    >
      {glyph && <span aria-hidden="true">{glyph}</span>}
      {children}
    </span>
  );
}

export function StateBadge({ state, className }: { state: SignalState | null | undefined; className?: string }) {
  if (!state) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  const meta = SIGNAL_STATE_META[state];
  return (
    <Badge tone={meta.tone} glyph={meta.glyph} className={className} title={`Signal state: ${state}`}>
      {meta.label}
    </Badge>
  );
}

export function DecisionBadge({
  decision,
  className,
}: {
  decision: ExecutionDecision | null | undefined;
  className?: string;
}) {
  if (!decision) {
    return <Badge tone="muted" className={className}>Not evaluated</Badge>;
  }
  const meta = DECISION_META[decision];
  return (
    <Badge
      tone={meta.tone}
      glyph={meta.glyph}
      className={className}
      title={
        decision === "EXECUTE"
          ? "Engine decision: EXECUTE. Paper Trading processes this automatically after a scanner refresh."
          : `Execution decision: ${decision}`
      }
    >
      {decision === "EXECUTE" ? "ENGINE EXECUTE" : meta.label}
    </Badge>
  );
}

export function DirectionBadge({
  direction,
  className,
}: {
  direction: Direction | null | undefined;
  className?: string;
}) {
  if (!direction) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  const meta = DIRECTION_META[direction];
  return (
    <Badge tone={meta.tone} glyph={meta.glyph} className={className} title={`Direction: ${direction}`}>
      {meta.label}
    </Badge>
  );
}

export function FreshnessBadge({
  status,
  className,
}: {
  status: FreshnessStatus | null | undefined;
  className?: string;
}) {
  if (!status) {
    return <Badge tone="muted" className={className}>No data</Badge>;
  }
  const meta = FRESHNESS_META[status];
  return (
    <Badge tone={meta.tone} glyph={meta.glyph} className={className} title={`Data freshness: ${status}`}>
      {meta.label}
    </Badge>
  );
}

export function BiasBadge({ bias, className }: { bias: BiasLabel | null | undefined; className?: string }) {
  if (!bias) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  return (
    <Badge tone={biasTone(bias)} className={className} title={`Bias: ${bias}`}>
      {BIAS_DISPLAY[bias]}
    </Badge>
  );
}

export function RegimeBadge({ regime, className }: { regime: RegimeLabel | null | undefined; className?: string }) {
  if (!regime) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  return (
    <Badge tone={regimeTone(regime)} className={className} title={`Regime: ${regime}`}>
      {REGIME_DISPLAY[regime]}
    </Badge>
  );
}

export function SetupStateBadge({
  state,
  className,
}: {
  state: SetupState | null | undefined;
  className?: string;
}) {
  if (!state) {
    return <Badge tone="muted" className={className}>{NOT_AVAILABLE}</Badge>;
  }
  const meta = SETUP_STATE_META[state];
  return (
    <Badge tone={meta.tone} className={className} title={`Setup state: ${state}`}>
      {meta.label}
    </Badge>
  );
}

export function TriggerStateBadge({
  state,
  className,
}: {
  state: TriggerState | null | undefined;
  className?: string;
}) {
  if (!state) {
    return <Badge tone="muted" className={className}>Not evaluated</Badge>;
  }
  const meta = TRIGGER_STATE_META[state];
  return (
    <Badge tone={meta.tone} className={className} title={`Trigger state: ${state}`}>
      {meta.label}
    </Badge>
  );
}

/** Provider connection state, with an explicit glyph for the state. */
export function ProviderStateBadge({
  state,
  className,
}: {
  state: "CONNECTED" | "DEGRADED" | "DISCONNECTED" | null | undefined;
  className?: string;
}) {
  if (state === "CONNECTED") {
    return <Badge tone="bullish" glyph="â—" className={className}>Connected</Badge>;
  }
  if (state === "DEGRADED") {
    return <Badge tone="warning" glyph="â—”" className={className}>Degraded</Badge>;
  }
  if (state === "DISCONNECTED") {
    return <Badge tone="danger" glyph="âœ•" className={className}>Disconnected</Badge>;
  }
  return <Badge tone="muted" glyph="â—Œ" className={className}>No provider</Badge>;
}


========== src\app\backtest\page.tsx ==========
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BacktestWorkspace } from "@/components/backtest/backtest-workspace";

export const dynamic = "force-dynamic";

export default function BacktestPage() {
  return (
    <DashboardShell statusLabel="HISTORICAL Â· BACKTEST">
      <BacktestWorkspace />
    </DashboardShell>
  );
}


========== src\app\journal\page.tsx ==========
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { JournalWorkspace } from "@/components/paper/journal-workspace";
import { readDashboard } from "@/server/scanner-access";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const data = await readDashboard();

  return (
    <DashboardShell
      providerId={data.providerId}
      liveMarketData={data.liveMarketData}
      providerState={data.health?.providerStatus?.state ?? null}
      releaseLabel={
        data.releaseRuntime?.status === "ACTIVE"
          ? "STRAT Â· " + data.releaseRuntime.version
          : data.releaseRuntime?.status === "BLOCKED"
            ? "STRAT Â· BLOCKED"
            : "STRAT Â· UNVERSIONED"
      }
      releaseBlocked={data.releaseRuntime?.status === "BLOCKED"}
    >
      <JournalWorkspace initialPaper={data.paper} />
    </DashboardShell>
  );
}


========== src\app\system\page.tsx ==========
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SystemWorkspace } from "@/components/system/system-workspace";
import { readDashboard } from "@/server/scanner-access";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const data = await readDashboard();

  return (
    <DashboardShell
      providerId={data.providerId}
      liveMarketData={data.liveMarketData}
      providerState={data.health?.providerStatus?.state ?? null}
      releaseLabel={
        data.releaseRuntime?.status === "ACTIVE"
          ? "STRAT Â· " + data.releaseRuntime.version
          : data.releaseRuntime?.status === "BLOCKED"
            ? "STRAT Â· BLOCKED"
            : "STRAT Â· UNVERSIONED"
      }
      releaseBlocked={data.releaseRuntime?.status === "BLOCKED"}
    >
      <SystemWorkspace data={data} />
    </DashboardShell>
  );
}


========== src\app\error.tsx ==========
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0e14] p-6 text-zinc-200">
      <section
        role="alert"
        className="w-full max-w-lg rounded border border-orange-700/50 bg-orange-950/20 p-5"
      >
        <div className="font-mono text-xs font-semibold uppercase tracking-wider text-orange-300">
          Dashboard unavailable
        </div>
        <h1 className="mt-2 text-lg font-semibold text-zinc-100">
          The signal workspace could not be rendered.
        </h1>
        <p className="mt-2 break-words text-xs leading-relaxed text-zinc-400">
          {error.message || "An unexpected application error occurred."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          Retry
        </button>
      </section>
    </main>
  );
}


========== src\app\loading.tsx ==========
export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading signal dashboard"
      className="min-h-screen bg-[#0b0e14] p-4 text-zinc-200"
    >
      <div className="mx-auto max-w-[1900px] animate-pulse space-y-4">
        <div className="h-12 rounded border border-zinc-800 bg-zinc-900/50" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-20 rounded border border-zinc-800 bg-zinc-900/40"
            />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="h-[34rem] rounded border border-zinc-800 bg-zinc-900/30" />
          <div className="h-[34rem] rounded border border-zinc-800 bg-zinc-900/30" />
        </div>
      </div>
    </main>
  );
}

PS C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)>