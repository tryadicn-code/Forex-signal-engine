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
      className="rounded border border-zinc-800 bg-zinc-900/30"
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <h2 id="market-health-title" className="text-sm font-semibold text-zinc-100">
            Market data health
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Provider state, freshness, and scan isolation.
          </p>
        </div>
        <ProviderStateBadge state={provider?.state ?? null} />
      </header>

      <div className="grid grid-cols-2 gap-px bg-zinc-800 sm:grid-cols-4">
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

      <div className="space-y-3 px-3 py-3">
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Freshness
          </div>
          <div className="flex flex-wrap gap-2">
            <FreshnessCount label="FRESH" count={freshness.FRESH} />
            <FreshnessCount label="DELAYED" count={freshness.DELAYED} />
            <FreshnessCount label="STALE" count={freshness.STALE} />
          </div>
        </div>

        <div>
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
            className="rounded border border-orange-700/40 bg-orange-950/20 px-2.5 py-2"
          >
            <div className="text-[10px] font-medium uppercase tracking-wider text-orange-300">
              Isolated failures
            </div>
            <p className="mt-1 font-mono text-xs text-orange-200/80">
              {failedSymbols.join(", ")}
            </p>
            <p className="mt-1 text-[11px] text-orange-200/50">
              Other symbols remain available because failures are isolated per pair.
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
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className="mt-0.5 font-mono text-xs text-zinc-300">{value}</div>
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
    <div className="flex items-center gap-2 rounded border border-zinc-800 bg-[#0b0e14] px-2.5 py-1.5">
      <FreshnessBadge status={label} />
      <span className="font-mono text-sm font-semibold tabular-nums text-zinc-200">
        {count}
      </span>
    </div>
  );
}
