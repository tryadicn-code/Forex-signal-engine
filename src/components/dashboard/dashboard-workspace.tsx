"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { ScannerCards } from "@/components/scanner/scanner-cards";
import { ScannerEmptyState } from "@/components/scanner/scanner-empty-state";
import { ScannerFilters } from "@/components/scanner/scanner-filters";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { SignalDetailPanel } from "@/components/signals/signal-detail-panel";
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
  const [requestError, setRequestError] = useState<string | null>(null);
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
    const saved = window.localStorage.getItem("fse:selected-symbol");
    if (
      saved &&
      selectedSymbol === null &&
      allResults.some((result) => result.symbol === saved)
    ) {
      setSelectedSymbol(saved);
    }
  }, [allResults, selectedSymbol]);

  useEffect(() => {
    if (selectedSymbol) {
      window.localStorage.setItem("fse:selected-symbol", selectedSymbol);
    }
  }, [selectedSymbol]);

  useEffect(() => {
    if (!data.automation?.enabled) return;

    const tick = () => setClockNow(Date.now());
    const initialTick = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1_000);

    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(timer);
    };
  }, [data.automation?.enabled]);

  useEffect(() => {
    if (!data.automation?.enabled) return;

    const intervalMs = Math.max(5_000, data.automation.dashboardSyncIntervalMs);
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
        setData((await response.json()) as DashboardData);
      } catch {
        // Preserve the last good workstation state on read-only sync failure.
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => {
      void syncLatestView();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [data.automation?.dashboardSyncIntervalMs, data.automation?.enabled]);

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
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/scanner", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok || cancelled) return;
        setData((await response.json()) as DashboardData);
      } catch {
        // Normal polling will retry.
      }
    }, 750);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [countdownSeconds, data.automation?.enabled, nextScanAt]);

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

  const errorMessage = requestError ?? data.scanError;
  const runtimeIssue =
    data.releaseRuntime && data.releaseRuntime.status !== "ACTIVE"
      ? data.releaseRuntime
      : null;

  return (
    <div className="mx-auto w-full max-w-[1900px] space-y-4 p-3 sm:p-4 lg:p-5">
      <section id="overview" aria-labelledby="overview-title" className="scroll-mt-20">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1
              id="overview-title"
              className="text-2xl font-semibold tracking-tight text-zinc-100"
            >
              Market opportunities
            </h1>
            <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
              Find what needs attention now. Engine decisions remain unchanged.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-600">Last sync</span>
            <span className="font-mono tabular-nums text-zinc-300">
              {refreshing
                ? "Syncing…"
                : formatTime(data.health?.lastScanCompletedAt)}
            </span>
            {data.automation?.enabled && (
              <span className="hidden font-mono tabular-nums text-zinc-600 sm:inline">
                · next {countdownSeconds ?? "—"}s
              </span>
            )}
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-emerald-700/60 hover:text-emerald-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              {refreshing ? "Syncing…" : "Refresh"}
            </button>
          </div>
        </div>

        <DashboardSummary
          snapshot={data.snapshot}
          health={data.health}
          activeSignals={data.activeSignals}
        />

        {runtimeIssue && (
          <a
            href="/system"
            className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-900/60 bg-amber-950/15 px-3 py-2.5 text-xs"
          >
            <span>
              <strong className="text-amber-300">Strategy needs attention.</strong>{" "}
              <span className="text-zinc-500">{runtimeIssue.message}</span>
            </span>
            <span className="shrink-0 text-amber-300">System ›</span>
          </a>
        )}
      </section>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2.5 text-xs text-red-200"
        >
          <span className="font-semibold">Scanner issue:</span>{" "}
          <span className="text-red-200/70">{errorMessage}</span>
        </div>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)] 2xl:grid-cols-[minmax(0,2.1fr)_minmax(400px,1fr)]">
        <section
          id="scanner"
          aria-labelledby="scanner-title"
          className="min-w-0 scroll-mt-20 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/25"
        >
          <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-3.5 sm:px-4">
            <div>
              <h2 id="scanner-title" className="text-base font-semibold text-zinc-100">
                Scanner
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Select a pair to inspect its current trading state.
              </p>
            </div>
            <span className="font-mono text-xs text-zinc-600">
              {visibleResults.length}/{allResults.length}
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

          <div
            aria-busy={refreshing}
            className={refreshing ? "opacity-60" : undefined}
          >
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

        <div
          id="signals"
          className="min-w-0 scroll-mt-20 xl:sticky xl:top-[4.5rem] xl:self-start"
        >
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

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3 text-[11px] text-zinc-600">
        <span>
          {(data.liveMarketData
            ? (data.providerId ?? "live").toUpperCase()
            : "Mock") +
            " provider"}{" "}
          · broker {data.broker?.mode ?? "OFF"}
        </span>
        <a href="/system" className="text-zinc-400 hover:text-zinc-200">
          System & diagnostics ›
        </a>
      </footer>
    </div>
  );
}
