import type { BacktestRunArtifact } from "@/replay/backtest-run-types";

export function ReleaseGateHeader({
  artifact,
  fingerprint,
  current,
  onExport,
}: {
  artifact: BacktestRunArtifact;
  fingerprint: string;
  current: boolean;
  onExport: () => void;
}) {
  const state =
    artifact.releaseReview === undefined
      ? "UNREVIEWED"
      : current
        ? artifact.releaseReview.decision
        : "STALE";

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-sky-400/80">
          Phase 5.8
        </p>
        <h3 className="mt-0.5 text-xs font-semibold text-zinc-300">
          Validation evidence & release gate
        </h3>
        <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          Evidence status is descriptive. The stored release decision is entered manually by a reviewer.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] font-semibold text-zinc-400">
          {state}
        </span>
        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-600">
          FP {fingerprint}
        </span>
        <button
          type="button"
          onClick={onExport}
          className="rounded border border-zinc-700 px-2 py-1 font-mono text-[11px] text-zinc-500 hover:border-sky-800 hover:text-sky-300"
        >
          Export gate JSON
        </button>
      </div>
    </header>
  );
}