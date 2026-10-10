import { useState } from "react";

export function InitialBalanceControl({
  initialBalance,
  currency,
  onApply,
  applying,
  onReset,
  resetting,
}: {
  initialBalance: number;
  currency: string;
  onApply: (initialBalance: number) => Promise<void>;
  applying: boolean;
  onReset?: () => Promise<void>;
  resetting?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(initialBalance));
  const parsedBalance = Number(balanceInput);
  const valid =
    Number.isFinite(parsedBalance) &&
    parsedBalance > 0 &&
    parsedBalance <= 1_000_000_000;

  return (
    <div className="border-b border-zinc-800 px-3 py-2">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-600">
            Demo balance
          </span>
          <span className="h-3 w-px shrink-0 bg-zinc-800" aria-hidden="true" />
          <span className="truncate font-mono text-[11px] tabular-nums text-zinc-300">
            {currency} {initialBalance.toFixed(2)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/40 px-2 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3 w-3">
              <path d="m4 14.5-.5 2.5 2.5-.5L15 7.5 12.5 5 4 14.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="m11.5 6 2.5 2.5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span>{expanded ? "Hide" : "Edit"}</span>
          </button>
          {onReset && (
            <button
              type="button"
              disabled={resetting}
              onClick={() => void onReset()}
              aria-label="Reset paper account"
              title="Reset paper account"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-900/60 bg-red-950/15 text-red-300 transition-colors hover:border-red-800/70 hover:bg-red-950/30 hover:text-red-200 disabled:opacity-50"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                <path d="M15.5 6.5A6 6 0 1 0 16 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M15.5 3.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/45 p-2.5">
          <p className="text-[11px] leading-relaxed text-amber-300/75">
            Changing the demo balance resets positions, orders, journal, and performance.
          </p>
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <span className="font-mono text-[11px] text-zinc-500">{currency}</span>
            <input
              type="number"
              min="1"
              max="1000000000"
              step="100"
              inputMode="decimal"
              value={balanceInput}
              onChange={(event) => setBalanceInput(event.target.value)}
              className="h-10 min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 font-mono text-[11px] text-zinc-100 outline-none focus:border-emerald-700"
              aria-label="Initial paper balance"
            />
            <button
              type="button"
              disabled={applying || !valid || parsedBalance === initialBalance}
              onClick={() => {
                void onApply(parsedBalance).then(() => setExpanded(false));
              }}
              className="h-10 rounded-md border border-emerald-800/70 bg-emerald-950/20 px-2.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-950/35 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {applying ? "Applying..." : "Apply & Reset"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}