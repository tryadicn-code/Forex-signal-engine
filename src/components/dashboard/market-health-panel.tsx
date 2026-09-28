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
            <span aria-hidden="true" className="text-zinc-600">›</span>
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
