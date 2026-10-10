import { inputClass } from "../lib/constants";

export function RollbackPanel({
  rollbackBy,
  rollbackReason,
  disabled,
  onRollbackBy,
  onRollbackReason,
  onCancelRollback,
  onConfirmRollback,
}: {
  rollbackBy: string;
  rollbackReason: string;
  disabled: boolean;
  onRollbackBy: (value: string) => void;
  onRollbackReason: (value: string) => void;
  onCancelRollback: () => void;
  onConfirmRollback: () => Promise<void>;
}) {
  return (
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
  );
}