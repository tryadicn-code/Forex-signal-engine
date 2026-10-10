import type { BacktestRunListItem } from "@/replay/backtest-run-types";
import {
  formatPercent,
  formatSigned,
  formatUtc,
  signedPercent,
} from "../lib/formatters";
import {
  toneForExpectancy,
  toneForProfitFactor,
  toneForWinRate,
} from "../lib/tones";
import { MiniBar } from "./mini-bar";

export function RecentRuns({
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
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Persisted separately under .data/backtest-runs
        </p>
      </header>
      <div className="max-h-[430px] space-y-1.5 overflow-auto p-2">
        {runs.length === 0 ? (
          <div className="px-2 py-6 text-center text-[11px] text-zinc-500">
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
                <span className="truncate font-mono text-[11px] font-semibold text-zinc-300">
                  {run.label || run.datasetId}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {run.releaseDecision && (
                    <span className="rounded border border-zinc-800 px-1 py-0.5 font-mono text-[11px] text-zinc-500">
                      {run.releaseDecision}
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-zinc-600">
                    N {run.sampleSize}
                  </span>
                </div>
              </div>
              {run.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {run.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-zinc-800 px-1 py-0.5 font-mono text-[11px] text-zinc-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-zinc-600">
                <span>{run.symbols.join(", ")}</span>
                <span>{signedPercent(run.netReturnPercent)}</span>
                <span>DD {formatPercent(run.maxDrawdownPercent)}</span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                <MiniBar
                  label="E[R]"
                  value={run.expectancyR ?? 0}
                  max={2}
                  display={formatSigned(run.expectancyR, 2)}
                  tone={toneForExpectancy(run.expectancyR)}
                />
                <MiniBar
                  label="Win"
                  value={run.winRate ?? 0}
                  max={100}
                  display={
                    run.winRate === null || !Number.isFinite(run.winRate)
                      ? "—"
                      : run.winRate.toFixed(0) + "%"
                  }
                  tone={toneForWinRate(run.winRate)}
                />
                <MiniBar
                  label="PF"
                  value={run.profitFactor ?? 0}
                  max={3}
                  display={
                    run.profitFactor === null || !Number.isFinite(run.profitFactor)
                      ? "—"
                      : run.profitFactor.toFixed(2)
                  }
                  tone={toneForProfitFactor(run.profitFactor)}
                />
              </div>
              <div className="mt-1 font-mono text-[11px] text-zinc-500">
                {loadingRunId === run.id ? "Loading…" : formatUtc(run.completedAt)}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}