import type { StrategyVersionEntry } from "@/replay/strategy-version-types";

export function VersionCardHeader({
  entry,
  disabled,
  onExport,
  onStartRollback,
  onStartDeprecate,
}: {
  entry: StrategyVersionEntry;
  disabled: boolean;
  onExport: () => void;
  onStartRollback: () => void;
  onStartDeprecate: () => void;
}) {
  const manifest = entry.manifest;

  return (
    <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-zinc-200">
            {manifest.version}
          </span>
          <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-400">
            {entry.currentStatus}
          </span>
        </div>
        <h4 className="mt-1 text-[11px] font-medium text-zinc-400">
          {manifest.title}
        </h4>
        <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
          FP {manifest.manifestFingerprint} · report {manifest.sourceReportId}
        </p>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onExport}
          className="rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:border-emerald-800 hover:text-emerald-300"
        >
          Export manifest
        </button>
        {entry.currentStatus === "SUPERSEDED" && (
          <button
            type="button"
            disabled={disabled}
            onClick={onStartRollback}
            className="rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:border-sky-800 hover:text-sky-300 disabled:opacity-40"
          >
            Rollback
          </button>
        )}
        {entry.currentStatus !== "DEPRECATED" && (
          <button
            type="button"
            disabled={disabled}
            onClick={onStartDeprecate}
            className="rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 hover:border-amber-800 hover:text-amber-300 disabled:opacity-40"
          >
            Deprecate
          </button>
        )}
      </div>
    </header>
  );
}