import type { BacktestRunListItem } from "@/replay/backtest-run-types";
import {
  formatNumber,
  formatPercent,
  formatSigned,
} from "@/lib/backtest-format";
import { signedPercent } from "../lib/formatters";

export function MultiRunComparison({
  runs,
  selectedIds,
  selectedRuns,
  onToggle,
}: {
  runs: BacktestRunListItem[];
  selectedIds: string[];
  selectedRuns: BacktestRunListItem[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/30">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h3 className="text-xs font-semibold text-zinc-300">
          Multi-run comparison
        </h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Select up to 3 persisted runs. Metrics are shown side-by-side without scoring or ranking.
        </p>
      </header>

      <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-800 p-2">
        {runs.length === 0 ? (
          <span className="px-1 py-1 text-[11px] text-zinc-500">
            No persisted runs yet.
          </span>
        ) : (
          runs.map((run) => {
            const selected = selectedIds.includes(run.id);
            const disabled = !selected && selectedIds.length >= 3;
            return (
              <button
                key={run.id}
                type="button"
                disabled={disabled}
                onClick={() => onToggle(run.id)}
                className={
                  "shrink-0 rounded border px-2 py-1.5 text-left text-[11px] transition-colors disabled:opacity-30 " +
                  (selected
                    ? "border-cyan-800 bg-cyan-950/25 text-cyan-300"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700")
                }
              >
                <span className="block max-w-36 truncate font-semibold">
                  {run.label || run.datasetId}
                </span>
                <span className="mt-0.5 block font-mono text-[11px] opacity-70">
                  N {run.sampleSize} · {signedPercent(run.netReturnPercent)}
                </span>
              </button>
            );
          })
        )}
      </div>

      {selectedRuns.length === 0 ? (
        <div className="px-3 py-5 text-center text-[11px] text-zinc-500">
          Select runs above to compare validation metrics.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[11px]">
            <thead className="bg-zinc-950/60 text-zinc-600">
              <tr>
                <th className="px-3 py-2">Run</th>
                <th className="px-3 py-2">N</th>
                <th className="px-3 py-2">Win</th>
                <th className="px-3 py-2">PF</th>
                <th className="px-3 py-2">E[R]</th>
                <th className="px-3 py-2">Avg R</th>
                <th className="px-3 py-2">Return</th>
                <th className="px-3 py-2">Max DD</th>
                <th className="px-3 py-2">Risk</th>
                <th className="px-3 py-2">Spread</th>
                <th className="px-3 py-2">Policy</th>
              </tr>
            </thead>
            <tbody>
              {selectedRuns.map((run) => (
                <tr key={run.id} className="border-t border-zinc-800 text-zinc-400">
                  <td className="max-w-44 truncate px-3 py-2 font-medium text-zinc-200">
                    {run.label || run.datasetId}
                  </td>
                  <td className="px-3 py-2 font-mono">{run.sampleSize}</td>
                  <td className="px-3 py-2 font-mono">{formatPercent(run.winRate)}</td>
                  <td className="px-3 py-2 font-mono">{formatNumber(run.profitFactor, 2)}</td>
                  <td className="px-3 py-2 font-mono">{formatSigned(run.expectancyR, 2)}</td>
                  <td className="px-3 py-2 font-mono">{formatSigned(run.averageR, 2)}</td>
                  <td className="px-3 py-2 font-mono">{signedPercent(run.netReturnPercent)}</td>
                  <td className="px-3 py-2 font-mono">{formatPercent(run.maxDrawdownPercent)}</td>
                  <td className="px-3 py-2 font-mono">{run.riskPercent.toFixed(2)}%</td>
                  <td className="px-3 py-2 font-mono">{run.assumedSpreadPips.toFixed(1)}</td>
                  <td className="px-3 py-2 font-mono">{run.intrabarConflictPolicy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}