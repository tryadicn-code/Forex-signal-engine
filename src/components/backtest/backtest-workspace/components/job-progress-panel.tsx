import { useEffect, useState } from "react";
import type { BacktestJobSnapshot } from "@/server/backtest-job-registry";

export function JobProgressPanel({
  job,
  cancelling,
  onCancel,
}: {
  job: BacktestJobSnapshot;
  cancelling: boolean;
  onCancel: () => void;
}) {
  // Local 1-second tick so elapsed/ETA update on their own without calling
  // Date.now() during render (react-hooks/purity forbids impure calls in
  // the render body).
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [job.id]);

  const total = job.totalSteps > 0 ? job.totalSteps : 0;
  const done = job.completedSteps;
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  const now = nowTick || job.createdAt;
  const elapsedMs = job.startedAt ? now - job.startedAt : now - job.createdAt;
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const stepsPerSec = elapsedSec > 0 ? done / elapsedSec : 0;
  const remainingSteps = total > 0 ? Math.max(0, total - done) : 0;
  const etaSec =
    stepsPerSec > 0 && remainingSteps > 0
      ? Math.round(remainingSteps / stepsPerSec)
      : null;

  return (
    <section className="rounded-md border border-cyan-900/60 bg-cyan-950/10">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-900/40 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-cyan-100">
            Backtest running in background
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-cyan-200/60">
            {job.id}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-cyan-200/80">
            {elapsedSec}s elapsed
            {etaSec !== null ? " · ~" + etaSec + "s left" : ""}
          </span>
          <button
            type="button"
            disabled={cancelling}
            onClick={onCancel}
            className="rounded border border-red-800 bg-red-950/30 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cancelling ? "Cancelling..." : "Cancel"}
          </button>
        </div>
      </header>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between text-[11px] text-cyan-200/70">
          <span>
            {done.toLocaleString()} / {total > 0 ? total.toLocaleString() : "?"} M15 steps
          </span>
          <span className="font-mono">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-950/40">
          <div
            className="h-full bg-cyan-500 transition-[width] duration-300"
            style={{ width: pct + "%" }}
          />
        </div>
      </div>
    </section>
  );
}