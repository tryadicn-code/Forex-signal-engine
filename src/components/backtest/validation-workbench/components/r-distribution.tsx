import type { BacktestRunArtifact } from "@/replay/backtest-run-types";

export function RDistribution({
  artifact,
}: {
  artifact: BacktestRunArtifact;
}) {
  const bins = artifact.analytics.rDistribution;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h3 className="text-xs font-semibold text-zinc-300">R distribution</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Closed-trade outcome distribution; bins are mutually exclusive.
        </p>
      </header>
      <div className="grid grid-cols-5 gap-2 p-3">
        {bins.map((bin) => (
          <div key={bin.key} className="min-w-0">
            <div className="flex h-20 items-end overflow-hidden rounded bg-zinc-900">
              <div
                className="w-full bg-emerald-700/55"
                style={{
                  height:
                    bin.count === 0
                      ? "0%"
                      : Math.max(8, (bin.count / maxCount) * 100) + "%",
                }}
              />
            </div>
            <div className="mt-1 truncate text-center font-mono text-[11px] text-zinc-600">
              {bin.label}
            </div>
            <div className="text-center font-mono text-[11px] font-semibold text-zinc-300">
              {bin.count}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}