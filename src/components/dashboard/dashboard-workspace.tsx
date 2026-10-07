"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { MarketHealthPanel } from "@/components/dashboard/market-health-panel";
import { SignalFunnelSummary } from "@/components/analytics/signal-funnel-summary";
import { ScannerCards } from "@/components/scanner/scanner-cards";
import { ScannerEmptyState } from "@/components/scanner/scanner-empty-state";
import { ScannerFilters } from "@/components/scanner/scanner-filters";
import { ScannerTable } from "@/components/scanner/scanner-table";
import { ScannerUniverseControl } from "@/components/scanner/scanner-universe-control";
import { SignalDetailPanel } from "@/components/signals/signal-detail-panel";
import {
  DEFAULT_QUERY,
  DEFAULT_SORT,
  filterAndSort,
  type ScannerQuery,
  type ScannerSort,
} from "@/lib/scanner-query";
import { apiFetch, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { DashboardData, DownstreamStatus } from "@/types/dashboard";

const DASHBOARD_READ_TIMEOUT_MS = 10_000;
const SCANNER_REFRESH_TIMEOUT_MS = 90_000;

function scrollIntoViewIfAvailable(target: HTMLElement | null): void {
  if (target && typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function requestDashboard(
  method: "GET" | "POST",
  timeoutMs: number
): Promise<DashboardData> {
  return apiFetch<DashboardData>("/api/scanner", {
    method,
    cache: "no-store",
    timeoutMs,
    // POST /api/scanner is protected by the broker approval secret; the GET
    // path is public because the dashboard reads it on every page load.
    requireSecret: method === "POST",
  });
}

export function DashboardWorkspace({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState<ScannerQuery>(DEFAULT_QUERY);
  const [sort, setSort] = useState<ScannerSort>(DEFAULT_SORT);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const scanInFlightRef = useRef(false);

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
    const openSignalDetail = (symbol: string): boolean => {
      const normalized = symbol.trim().toUpperCase();
      if (!allResults.some((result) => result.symbol === normalized)) {
        return false;
      }

      setSelectedSymbol(normalized);

      window.setTimeout(() => {
        const target =
          document.querySelector<HTMLElement>(
            `[data-signal-symbol="${normalized}"]`
          ) ?? document.getElementById("signals");
        scrollIntoViewIfAvailable(target);
      }, 0);

      return true;
    };

    const onOpenSignalDetail = (event: Event) => {
      const detail = (event as CustomEvent<{ symbol?: string }>).detail;
      if (detail?.symbol) openSignalDetail(detail.symbol);
    };

    window.addEventListener("fse:open-signal-detail", onOpenSignalDetail);

    const requested = window.sessionStorage.getItem("fse:open-signal-symbol");
    if (requested && allResults.length > 0 && openSignalDetail(requested)) {
      window.sessionStorage.removeItem("fse:open-signal-symbol");
    }

    return () => {
      window.removeEventListener("fse:open-signal-detail", onOpenSignalDetail);
    };
  }, [allResults]);

  useEffect(() => {
    const focusReadySignal = () => {
      const ready = allResults.find(
        (result) =>
          result.executionDecision === "EXECUTE" &&
          result.signalState === "EXECUTE"
      );

      const target = ready
        ? document.querySelector<HTMLElement>(
            `[data-signal-symbol="${ready.symbol}"]`
          )
        : document.getElementById("scanner");

      scrollIntoViewIfAvailable(target);
    };

    window.addEventListener("fse:focus-ready-signal", focusReadySignal);

    const requested =
      window.sessionStorage.getItem("fse:focus-ready-signal") === "1";
    if (requested && allResults.length > 0) {
      window.sessionStorage.removeItem("fse:focus-ready-signal");
      const timer = window.setTimeout(focusReadySignal, 0);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("fse:focus-ready-signal", focusReadySignal);
      };
    }

    return () => {
      window.removeEventListener("fse:focus-ready-signal", focusReadySignal);
    };
  }, [allResults]);

  useEffect(() => {
    if (!data.automation?.enabled) return;

    const intervalMs = Math.max(5_000, data.automation.dashboardSyncIntervalMs);
    let inFlight = false;

    const syncLatestView = async () => {
      if (
        inFlight ||
        scanInFlightRef.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }
      inFlight = true;

      try {
        const next = await requestDashboard("GET", DASHBOARD_READ_TIMEOUT_MS);
        if (!scanInFlightRef.current) setData(next);
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


  const clearFilters = () => {
    setQuery(DEFAULT_QUERY);
    setSort(DEFAULT_SORT);
  };

  const refresh = async () => {
    if (refreshing || scanInFlightRef.current) return;

    scanInFlightRef.current = true;
    setRefreshing(true);
    setRequestError(null);

    try {
      const next = await requestDashboard("POST", SCANNER_REFRESH_TIMEOUT_MS);
      setData(next);

      if (
        selectedSymbol &&
        !next.snapshot?.results.some((result) => result.symbol === selectedSymbol)
      ) {
        setSelectedSymbol(null);
      }
    } catch (error) {
      // A 401 means the operator has not configured the approval secret yet.
      // Surface a clear message and let the dialog handle the fix.
      if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
        setRequestError(
          "Approval secret is required to refresh. Set it from the dialog, then try again."
        );
        return;
      }
      // A browser/LAN connection can drop while the server scan continues.
      // Never retry POST automatically: recover the latest committed scanner
      // view with a read-only GET so a transport blip cannot duplicate a scan.
      try {
        const recovered = await requestDashboard("GET", DASHBOARD_READ_TIMEOUT_MS);
        setData(recovered);
        setRequestError(recovered.scanError);
      } catch {
        const message =
          error instanceof TypeError && /failed to fetch/i.test(error.message)
            ? "Scanner connection was interrupted. Last confirmed data is still shown."
            : error instanceof Error
              ? error.message
              : String(error);
        setRequestError(message);
      }
    } finally {
      scanInFlightRef.current = false;
      setRefreshing(false);
    }
  };
  const errorMessage = requestError ?? data.scanError;
  const runtimeIssue =
    data.releaseRuntime && data.releaseRuntime.status !== "ACTIVE"
      ? data.releaseRuntime
      : null;
  const runtimeIssueTitle =
    runtimeIssue?.status === "BLOCKED" ? "Strategy blocked" : "Strategy not versioned";
  const runtimeIssueDetail =
    runtimeIssue?.status === "BLOCKED" ? runtimeIssue.message : "Using built-in defaults";

  return (
    <div className="mx-auto w-full max-w-[1900px] space-y-4 p-3 sm:p-4 lg:p-5">
      <section id="overview" aria-label="Market overview" className="scroll-mt-20">
        <DashboardSummary
          snapshot={data.snapshot}
          health={data.health}
          liveMarketData={Boolean(data.liveMarketData)}
          providerId={data.providerId ?? null}
          onRefresh={refresh}
          refreshing={refreshing}
          onFilter={(state) => {
            setQuery({ ...DEFAULT_QUERY, state });
            const target = document.getElementById("scanner");
            if (target && typeof target.scrollIntoView === "function") {
              target.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
        />

        {runtimeIssue && (
          <a
            href="/system"
            className="mt-4 flex items-center justify-between gap-3 rounded-md border border-amber-900/50 bg-amber-950/10 px-3 py-2 text-[11px] sm:text-xs"
          >
            <span className="min-w-0 truncate">
              <strong className="text-amber-300">{"\u26A0 "}{runtimeIssueTitle}</strong>
              <span className="text-zinc-600">{" \u00B7 "}</span>
              <span className="text-zinc-500">{runtimeIssueDetail}</span>
            </span>
            <span className="shrink-0 text-amber-300">System {"\u203A"}</span>
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

      {data.downstreamStatus && (
        <DownstreamStatusBanner status={data.downstreamStatus} />
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)] 2xl:grid-cols-[minmax(0,2.1fr)_minmax(400px,1fr)]">
        <section
          id="scanner"
          aria-labelledby="scanner-title"
          className="min-w-0 scroll-mt-20 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/25"
        >
          <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5 sm:items-center sm:px-4 sm:py-3">
            <div className="min-w-0">
              <h2 id="scanner-title" className="text-[15px] font-semibold leading-tight text-zinc-100 sm:text-base">
                Scanner
              </h2>
              <p className="mt-1 text-[11px] leading-snug text-zinc-500 sm:text-xs">
                Select a pair to inspect current state.
              </p>
            </div>
            <ScannerUniverseControl
              count={allResults.length}
              onUniverseChanged={refresh}
            />
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
          className={cn(
            "min-w-0 scroll-mt-20 xl:sticky xl:top-[4.5rem] xl:self-start",
            !selectedResult && "hidden xl:block"
          )}
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

      <SignalFunnelSummary analytics={data.signalFunnel} />

      <MarketHealthPanel snapshot={data.snapshot} health={data.health} />

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-3 text-[11px] text-zinc-600">
        <span>
          {(data.liveMarketData
            ? (data.providerId ?? "live").toUpperCase()
            : "Mock") +
            " provider"}{" "}
        </span>
        <a href="/system" className="text-zinc-400 hover:text-zinc-200">
          System & diagnostics {"\u203A"}
        </a>
      </footer>
    </div>
  );
}
function DownstreamStatusBanner({ status }: { status: DownstreamStatus }) {
  const stages: Array<{ key: keyof DownstreamStatus; label: string }> = [
    { key: "forwardValidation", label: "Forward validation" },
    { key: "paper", label: "Paper" },
    { key: "notification", label: "Notification" },
    { key: "broker", label: "Broker" },
  ];
  const problems = stages.filter(({ key }) => status[key].ok !== true);
  if (problems.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-900/50 bg-amber-950/15 px-3 py-2.5 text-xs"
    >
      <div className="font-semibold text-amber-300">
        Scan succeeded; downstream pipeline issue:
      </div>
      <ul className="mt-1 space-y-0.5">
        {problems.map(({ key, label }) => {
          const s = status[key];
          if (s.ok === true) return null;
          const detail = s.ok === false ? s.error : s.because;
          const kind = s.ok === false ? "ERROR" : "SKIPPED";
          return (
            <li key={key} className="text-amber-200/80">
              <span className="font-medium">{label}:</span> {kind} — {detail}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
