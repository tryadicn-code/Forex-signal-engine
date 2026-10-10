export function BottomActionBar({
  running,
  jobId,
  cancelling,
  filesCount,
  riskPercent,
  onRun,
  onCancel,
}: {
  running: boolean;
  jobId: string | null;
  cancelling: boolean;
  filesCount: number;
  riskPercent: string;
  onRun: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 border-t border-zinc-800 bg-[#0b0e14]/95 backdrop-blur md:bottom-0 md:left-52">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          disabled={running || filesCount === 0}
          onClick={onRun}
          className="rounded-md border border-emerald-700/70 bg-emerald-950/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-300 transition-colors hover:bg-emerald-900/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running
            ? jobId
              ? "Replaying..."
              : "Validating..."
            : "Validate & run backtest"}
        </button>
        {jobId && (
          <button
            type="button"
            disabled={cancelling}
            onClick={onCancel}
            className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-red-300 transition-colors hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cancelling ? "Cancelling..." : "Cancel"}
          </button>
        )}
        <span className="ml-auto font-mono text-[11px] text-zinc-600">
          {filesCount} files {filesCount > 0 ? "· " + riskPercent + "% risk" : "· no files"}
        </span>
      </div>
    </div>
  );
}