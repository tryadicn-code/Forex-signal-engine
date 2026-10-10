import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import { formatUtc } from "../lib/formatters";

export function BacktestResultHeader({
  artifact,
  onExport,
}: {
  artifact: BacktestRunArtifact;
  onExport: () => void;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/30 px-3 py-2.5">
      <div>
        <p className="font-mono text-[11px] text-zinc-600">{artifact.id}</p>
        <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
          {artifact.metadata?.label || "Validation report"}
        </h2>
        {artifact.metadata?.tags && artifact.metadata.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {artifact.metadata.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-zinc-800 px-1 py-0.5 font-mono text-[11px] text-zinc-600"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-1 text-[11px] text-zinc-500">
          {artifact.validation.symbols.join(", ")} · {formatUtc(artifact.config.startAt)} → {formatUtc(artifact.config.endAt)} · {(artifact.durationMs / 1000).toFixed(1)}s
        </p>
      </div>
      <button
        type="button"
        onClick={onExport}
        className="rounded border border-zinc-700 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-emerald-800 hover:text-emerald-300"
      >
        Export JSON
      </button>
    </section>
  );
}