import type { HistoricalForwardComparison } from "@/replay/analytics-types";
import { formatGeneric, formatGenericDelta } from "../lib/formatters";

export function ForwardComparisonPanel({
  comparison,
  loading,
  error,
  onCompare,
}: {
  comparison: HistoricalForwardComparison | null;
  loading: boolean;
  error: string | null;
  onCompare: () => Promise<void>;
}) {
  const rows = comparison
    ? [
        ["Sample size", comparison.historical.sampleSize, comparison.forward.sampleSize, comparison.delta.sampleSize],
        ["Win rate", comparison.historical.winRate, comparison.forward.winRate, comparison.delta.winRate],
        ["Profit factor", comparison.historical.profitFactor, comparison.forward.profitFactor, comparison.delta.profitFactor],
        ["Expectancy R", comparison.historical.expectancyR, comparison.forward.expectancyR, comparison.delta.expectancyR],
        ["Average R", comparison.historical.averageR, comparison.forward.averageR, comparison.delta.averageR],
        ["Max DD %", comparison.historical.maxDrawdownPercent, comparison.forward.maxDrawdownPercent, comparison.delta.maxDrawdownPercent],
        ["Net return %", comparison.historical.netReturnPercent, comparison.forward.netReturnPercent, comparison.delta.netReturnPercent],
      ]
    : [];

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold text-zinc-300">
            Historical vs forward paper
          </h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Reads the current Paper summary only when requested; no stores are merged.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void onCompare()}
          className="rounded border border-zinc-700 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 hover:border-emerald-800 hover:text-emerald-300 disabled:opacity-50"
        >
          {loading ? "Reading…" : "Compare with Paper"}
        </button>
      </header>

      {error && <div className="px-3 py-2 text-[11px] text-red-300">{error}</div>}

      {!comparison ? (
        <div className="px-3 py-5 text-center text-[11px] text-zinc-500">
          No forward comparison loaded.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[11px]">
            <thead className="bg-zinc-950/60 text-zinc-600">
              <tr>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2">Historical</th>
                <th className="px-3 py-2">Paper forward</th>
                <th className="px-3 py-2">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, historical, forward, delta]) => (
                <tr key={String(label)} className="border-t border-zinc-800 text-zinc-400">
                  <td className="px-3 py-2 text-zinc-300">{label}</td>
                  <td className="px-3 py-2 font-mono">{formatGeneric(historical)}</td>
                  <td className="px-3 py-2 font-mono">{formatGeneric(forward)}</td>
                  <td className="px-3 py-2 font-mono">{formatGenericDelta(delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-zinc-800 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
            Delta is Paper minus Historical. It is descriptive only; different sample size, dates and market regimes can make direct interpretation unreliable.
          </p>
        </div>
      )}
    </section>
  );
}