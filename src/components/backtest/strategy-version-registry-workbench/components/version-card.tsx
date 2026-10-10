import type { StrategyVersionEntry } from "@/replay/strategy-version-types";
import { formatUtc } from "@/lib/backtest-format";
import { inputClass } from "../lib/constants";
import { Fact } from "./fact";

export function VersionCard({
  entry,
  deprecating,
  rollingBack,
  deprecateBy,
  deprecateReason,
  rollbackBy,
  rollbackReason,
  disabled,
  onStartDeprecate,
  onStartRollback,
  onCancelDeprecate,
  onCancelRollback,
  onDeprecateBy,
  onDeprecateReason,
  onRollbackBy,
  onRollbackReason,
  onConfirmDeprecate,
  onConfirmRollback,
}: {
  entry: StrategyVersionEntry;
  deprecating: boolean;
  rollingBack: boolean;
  deprecateBy: string;
  deprecateReason: string;
  rollbackBy: string;
  rollbackReason: string;
  disabled: boolean;
  onStartDeprecate: () => void;
  onStartRollback: () => void;
  onCancelDeprecate: () => void;
  onCancelRollback: () => void;
  onDeprecateBy: (value: string) => void;
  onDeprecateReason: (value: string) => void;
  onRollbackBy: (value: string) => void;
  onRollbackReason: (value: string) => void;
  onConfirmDeprecate: () => Promise<void>;
  onConfirmRollback: () => Promise<void>;
}) {
  const manifest = entry.manifest;

  const exportManifest = () => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = manifest.version + "-strategy-manifest.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="rounded border border-zinc-800 bg-zinc-950/45">
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
            onClick={exportManifest}
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

      <div className="grid gap-2 px-3 py-2 sm:grid-cols-4">
        <Fact label="Registered" value={formatUtc(manifest.registeredAt)} />
        <Fact label="By" value={manifest.registeredBy} />
        <Fact label="Release reviewer" value={manifest.releaseReviewer} />
        <Fact label="Symbols" value={manifest.symbols.join(", ")} />
      </div>

      <details className="border-t border-zinc-800">
        <summary className="cursor-pointer px-3 py-2 text-[11px] text-zinc-600">
          Lifecycle & validation identity
        </summary>
        <div className="grid gap-3 border-t border-zinc-800 p-3 lg:grid-cols-2">
          <div className="space-y-1">
            {entry.statusHistory.map((event, index) => (
              <div
                key={event.changedAt + "-" + index}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-600"
              >
                <span className="font-mono font-semibold text-zinc-400">
                  {event.status}
                </span>
                {" · "}
                {formatUtc(event.changedAt)}
                {" · "}
                {event.changedBy}
                <div className="mt-0.5 text-zinc-500">{event.reason}</div>
              </div>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <Fact label="Validation FP" value={manifest.reproducibility.combined} />
            <Fact label="Assumption FP" value={manifest.reproducibility.assumptions} />
            <Fact
              label="Trigger score"
              value={String(
                manifest.strategySnapshot.engineConfig.trigger.minTriggerScore
              )}
            />
            <Fact
              label="Setup score"
              value={String(
                manifest.strategySnapshot.engineConfig.setup.minSetupScore
              )}
            />
          </dl>
        </div>
      </details>

      {rollingBack && (
        <div className="space-y-2 border-t border-zinc-800 bg-sky-950/10 p-3">
          <p className="text-[11px] text-sky-300">
            Controlled rollback reactivates this immutable SUPERSEDED manifest and supersedes the current ACTIVE release.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={rollbackBy}
              maxLength={80}
              onChange={(event) => onRollbackBy(event.target.value)}
              placeholder="Changed by"
              className={inputClass}
            />
            <input
              value={rollbackReason}
              maxLength={1000}
              onChange={(event) => onRollbackReason(event.target.value)}
              placeholder="Rollback reason"
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onConfirmRollback()}
              className="rounded border border-sky-800 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 disabled:opacity-40"
            >
              Confirm rollback
            </button>
            <button
              type="button"
              onClick={onCancelRollback}
              className="rounded border border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {deprecating && (
        <div className="space-y-2 border-t border-zinc-800 bg-amber-950/10 p-3">
          <p className="text-[11px] text-amber-300">
            Deprecation is append-only and does not delete or alter this manifest.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={deprecateBy}
              maxLength={80}
              onChange={(event) => onDeprecateBy(event.target.value)}
              placeholder="Changed by"
              className={inputClass}
            />
            <input
              value={deprecateReason}
              maxLength={1000}
              onChange={(event) => onDeprecateReason(event.target.value)}
              placeholder="Deprecation reason"
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onConfirmDeprecate()}
              className="rounded border border-amber-800 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 disabled:opacity-40"
            >
              Confirm deprecate
            </button>
            <button
              type="button"
              onClick={onCancelDeprecate}
              className="rounded border border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}