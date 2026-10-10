import { inputClass } from "../lib/constants";

export function DeprecatePanel({
  deprecateBy,
  deprecateReason,
  disabled,
  onDeprecateBy,
  onDeprecateReason,
  onCancelDeprecate,
  onConfirmDeprecate,
}: {
  deprecateBy: string;
  deprecateReason: string;
  disabled: boolean;
  onDeprecateBy: (value: string) => void;
  onDeprecateReason: (value: string) => void;
  onCancelDeprecate: () => void;
  onConfirmDeprecate: () => Promise<void>;
}) {
  return (
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
  );
}