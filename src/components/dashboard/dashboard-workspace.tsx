"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/common/badges";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { MarketHealthPanel } from "@/components/dashboard/market-health-panel";
import { PaperTradingPanel } from "@/components/paper/paper-trading-panel";
import { PaperTradingOverlay } from "@/components/paper/paper-trading-overlay";
import { ScannerCards } from "@/components/scanner/scanner-cards";
import { ScannerEmptyState } from "@/components/scanner/scanner-empty-state";
import { ScannerFilters } from "@/components/scanner/scanner-filters";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { SignalDetailPanel } from "@/components/signals/signal-detail-panel";
import { TransitionHistory } from "@/components/signals/transition-history";
import {
  DEFAULT_QUERY,
  DEFAULT_SORT,
  filterAndSort,
  type ScannerQuery,
  type ScannerSort,
} from "@/lib/scanner-query";
import { formatTime } from "@/lib/format";
import type { DashboardData } from "@/types/dashboard";

export function DashboardWorkspace({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState<ScannerQuery>(DEFAULT_QUERY);
  const [sort, setSort] = useState<ScannerSort>(DEFAULT_SORT);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [resettingPaper, setResettingPaper] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [paperOverlay, setPaperOverlay] = useState<"portfolio" | "journal" | null>(null);
  const [clockNow, setClockNow] = useState<number | null>(null);

  const allResults = useMemo(() => data.snapshot?.results ?? [], [data.snapshot]);
  const visibleResults = useMemo(
    () => filterAndSort(allResults, query, sort),
    [allResults, query, sort]
  );

  const selectedResult =
    allResults.find((result) => result.symbol === selectedSymbol) ?? null;
  const selectedSignal =
    selectedResult?.signalId
      ? data.allSignals.find((signal) => signal.signalId === selectedResult.signalId) ?? null
      : null;
  const selectedHistory =
    selectedResult?.signalId
      ? data.signalHistory[selectedResult.signalId] ?? []
      : [];

  useEffect(() => {
    if (!data.automation?.enabled) {
      setClockNow(null);
      return;
    }

    setClockNow(Date.now());
    const timer = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [data.automation?.enabled]);

  useEffect(() => {
    const openPaper = (event: Event) => {
      const detail = (event as CustomEvent<{ panel?: "portfolio" | "journal" }>).detail;
      if (detail?.panel === "portfolio" || detail?.panel === "journal") {
        setPaperOverlay(detail.panel);
      }
    };

    const navigateSignals = () => {
      const current =
        (selectedSymbol && allResults.find((item) => item.symbol === selectedSymbol)) ??
        visibleResults.find((item) => item.signalId) ??
        allResults.find((item) => item.signalId) ??
        null;

      if (current) {
        setSelectedSymbol(current.symbol);
        requestAnimationFrame(() => {
          document.getElementById("signals")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
        return;
      }

      document.getElementById("scanner")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };

    window.addEventListener("fse:open-paper-panel", openPaper);
    window.addEventListener("fse:navigate-signals", navigateSignals);
    return () => {
      window.removeEventListener("fse:open-paper-panel", openPaper);
      window.removeEventListener("fse:navigate-signals", navigateSignals);
    };
  }, [allResults, selectedSymbol, visibleResults]);

  useEffect(() => {
    if (!data.automation?.enabled) return;

    const intervalMs = Math.max(
      5_000,
      data.automation.dashboardSyncIntervalMs
    );
    let inFlight = false;

    const syncLatestView = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const response = await fetch("/api/scanner", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) return;
        const next = (await response.json()) as DashboardData;
        setData(next);
      } catch {
        // Read-only sync failure must not replace the last good workstation
        // state or interfere with the server-side paper scanner.
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => {
      void syncLatestView();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [
    data.automation?.dashboardSyncIntervalMs,
    data.automation?.enabled,
  ]);

  const nextScanAt = data.automation?.nextScanAt ?? null;
  const countdownSeconds =
    clockNow !== null && nextScanAt !== null
      ? Math.max(0, Math.ceil((nextScanAt - clockNow) / 1000))
      : null;

  useEffect(() => {
    if (
      !data.automation?.enabled ||
      countdownSeconds !== 0 ||
      nextScanAt === null
    ) {
      return;
    }

    let cancelled = false;
    const syncAfterDeadline = async () => {
      try {
        const response = await fetch("/api/scanner", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as DashboardData;
        if (!cancelled) setData(next);
      } catch {
        // The normal read-only polling loop will retry. A missed countdown
        // refresh must never affect the server-side scanner.
      }
    };

    const timer = window.setTimeout(() => {
      void syncAfterDeadline();
    }, 750);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    countdownSeconds,
    data.automation?.enabled,
    nextScanAt,
  ]);

  const clearFilters = () => {
    setQuery(DEFAULT_QUERY);
    setSort(DEFAULT_SORT);
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRequestError(null);

    try {
      const response = await fetch("/api/scanner", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Scanner refresh failed with HTTP " + response.status + ".");
      }
      const next = (await response.json()) as DashboardData;
      setData(next);
      if (
        selectedSymbol &&
        !next.snapshot?.results.some((result) => result.symbol === selectedSymbol)
      ) {
        setSelectedSymbol(null);
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
    }
  };

  const resetPaper = async () => {
    if (resettingPaper) return;
    if (!window.confirm("Reset all paper orders, positions, journal, and paper balance?")) return;
    setResettingPaper(true);
    setRequestError(null);
    try {
      const response = await fetch("/api/paper", {
        method: "DELETE",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Paper reset failed with HTTP " + response.status + ".");
      }
      const paper = await response.json();
      setData((current) => ({ ...current, paper }));
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setResettingPaper(false);
    }
  };

  const errorMessage = requestError ?? data.scanError;

  return (
    <div className="mx-auto w-full max-w-[1900px] space-y-4 p-3 sm:p-4">
      <section id="overview" aria-labelledby="overview-title" className="scroll-mt-16">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-400/80">
                Phase 4 · Paper Trading
              </p>
              <Badge
                tone={data.liveMarketData ? "bullish" : "info"}
                glyph={data.liveMarketData ? "●" : "◌"}
                className="text-[9px]"
              >
                {data.liveMarketData
                  ? "Live · " + (data.providerId ?? "provider").toUpperCase()
                  : "Mock data"}
              </Badge>
              {data.automation?.enabled && (
                <Badge tone="info" glyph="↻" className="text-[9px]">
                  AUTO
                </Badge>
              )}
            </div>
            <h1
              id="overview-title"
              className="mt-1 text-lg font-semibold tracking-tight text-zinc-100"
            >
              Market scanner
            </h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-zinc-500 sm:text-xs">
              FSE decisions with deterministic paper execution. No broker orders or real funds.
            </p>
          </div>

          <div className="shrink-0 text-right">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              aria-label="Refresh scan"
              className="rounded-md border border-emerald-700/60 bg-emerald-950/20 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-900/30 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div
          aria-live="polite"
          className="mb-3 grid grid-cols-2 gap-2 rounded-md border border-zinc-800 bg-zinc-900/25 p-2 sm:flex sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-600">
              Last scan
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-zinc-300">
              {refreshing
                ? "Scanning..."
                : formatTime(data.health?.lastScanCompletedAt)}
            </div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-600">
              Next auto scan
            </div>
            <div className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-emerald-300">
              {data.automation?.enabled
                ? countdownSeconds === null
                  ? "—"
                  : countdownSeconds + "s"
                : "OFF"}
            </div>
          </div>
        </div>

        <DashboardSummary
          snapshot={data.snapshot}
          health={data.health}
          activeSignals={data.activeSignals}
        />
      </section>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-orange-700/50 bg-orange-950/20 px-3 py-2 text-xs text-orange-200"
        >
          <span className="font-mono font-semibold">SCANNER ERROR</span>
          <span className="ml-2 text-orange-200/70">{errorMessage}</span>
        </div>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section
          id="scanner"
          aria-labelledby="scanner-title"
          className="min-w-0 scroll-mt-16 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/30"
        >
          <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-3">
            <div>
              <h2 id="scanner-title" className="text-sm font-semibold text-zinc-100">
                Scanner
              </h2>
              <p className="mt-0.5 hidden text-[11px] text-zinc-500 sm:block">
                Select a pair to inspect evidence and execution gates.
              </p>
            </div>
            <span className="font-mono text-[11px] text-zinc-600">
              {allResults.length} pairs
            </span>
          </header>

          <ScannerFilters
            query={query}
            sort={sort}
            resultCount={visibleResults.length}
            onQueryChange={setQuery}
            onSortChange={setSort}
            onClear={clearFilters}
          />

          <div aria-busy={refreshing} className={refreshing ? "opacity-60" : undefined}>
            {!data.snapshot ? (
              <div className="p-3">
                <ScannerEmptyState
                  kind={errorMessage ? "scan-error" : "no-scan"}
                  detail={errorMessage}
                  onRefresh={refresh}
                />
              </div>
            ) : allResults.length === 0 ? (
              <div className="p-3">
                <ScannerEmptyState kind="no-results" onRefresh={refresh} />
              </div>
            ) : visibleResults.length === 0 ? (
              <div className="p-3">
                <ScannerEmptyState
                  kind="no-matches"
                  onClearFilters={clearFilters}
                />
              </div>
            ) : (
              <>
                <div className="hidden xl:block">
                  <ScannerTable
                    results={visibleResults}
                    selectedSymbol={selectedSymbol}
                    onSelect={setSelectedSymbol}
                  />
                </div>
                <div className="xl:hidden">
                  <ScannerCards
                    results={visibleResults}
                    selectedSymbol={selectedSymbol}
                    onSelect={setSelectedSymbol}
                  />
                </div>
              </>
            )}
          </div>
        </section>

        <div id="signals" className="min-w-0 scroll-mt-16">
          <SignalDetailPanel
            result={selectedResult}
            signal={selectedSignal}
            transitions={selectedHistory}
            paper={data.paper}
            onRefresh={refresh}
            refreshing={refreshing}
            onClose={() => setSelectedSymbol(null)}
          />
        </div>
      </div>

      <div className="hidden md:block">
        <PaperTradingPanel
          paper={data.paper}
          onReset={resetPaper}
          resetting={resettingPaper}
        />
      </div>

      <PaperTradingOverlay
        open={paperOverlay !== null}
        view={paperOverlay ?? "portfolio"}
        paper={data.paper}
        onClose={() => setPaperOverlay(null)}
        onReset={resetPaper}
        resetting={resettingPaper}
      />

      <section
        id="markets"
        aria-label="Market data and signal history"
        className="grid scroll-mt-16 gap-4 lg:grid-cols-2"
      >
        <MarketHealthPanel snapshot={data.snapshot} health={data.health} />

        <section
          aria-labelledby="recent-transitions-title"
          className="hidden rounded-md border border-zinc-800 bg-zinc-900/30 sm:block"
        >
          <header className="border-b border-zinc-800 px-3 py-2.5">
            <h2 id="recent-transitions-title" className="text-sm font-semibold text-zinc-100">
              Recent signal transitions
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Repository audit trail across the current scanner session.
            </p>
          </header>
          <div className="p-3">
            <TransitionHistory
              transitions={data.recentTransitions}
              emptyLabel="No state transitions have been recorded yet."
            />
          </div>
        </section>

        <details className="rounded-md border border-zinc-800 bg-zinc-900/30 sm:hidden">
          <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-zinc-200">
            <span className="flex items-center justify-between">
              Recent signal transitions
              <span aria-hidden="true" className="text-zinc-600">›</span>
            </span>
          </summary>
          <div className="border-t border-zinc-800 p-3">
            <TransitionHistory
              transitions={data.recentTransitions}
              emptyLabel="No state transitions have been recorded yet."
            />
          </div>
        </details>
      </section>

      <footer className="border-t border-zinc-800 pt-3 text-[10px] leading-relaxed text-zinc-600">
        {(data.liveMarketData ? (data.providerId ?? "live").toUpperCase() : "Mock") +
          " provider"} · PAPER execution · filtering and sorting never modify engine decisions.
      </footer>
    </div>
  );
}
