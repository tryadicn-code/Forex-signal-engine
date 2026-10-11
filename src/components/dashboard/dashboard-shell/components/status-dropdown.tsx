import { useEffect, useRef, useState } from "react";

type ProviderState = "CONNECTED" | "DEGRADED" | "DISCONNECTED" | null;

export function StatusDropdown({
  providerState,
  providerId,
  strategyLabel,
  releaseBlocked,
  liveMarketData,
}: {
  providerState: ProviderState;
  providerId?: string;
  strategyLabel: string | null;
  releaseBlocked: boolean;
  liveMarketData?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const providerDotClass =
    providerState === "CONNECTED"
      ? "bg-emerald-400"
      : providerState === "DEGRADED"
        ? "bg-amber-400"
        : providerState === "DISCONNECTED"
          ? "bg-red-400"
          : "bg-zinc-600";

  const strategyDotClass = releaseBlocked
    ? "bg-red-400"
    : strategyLabel === "UNVERSIONED"
      ? "bg-transparent border border-zinc-500"
      : "bg-emerald-400";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open status menu"
        className="inline-flex h-7 items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 px-2 transition-colors hover:border-zinc-700"
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${providerDotClass}`} />
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${strategyDotClass}`} />
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="h-3 w-3 text-zinc-500"
        >
          <path
            d="M6 8l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-md border border-zinc-800 bg-[#0b0e14] shadow-2xl">
          <div className="border-b border-zinc-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Status
          </div>
          <div className="space-y-1.5 px-3 py-2 text-[11px]">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${providerDotClass}`} />
              <span className="text-zinc-300">
                {providerState ?? "Unknown"}
                {providerId ? ` \u00B7 ${providerId.toUpperCase()}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${strategyDotClass}`} />
              <span className="text-zinc-400">
                {releaseBlocked
                  ? "Strategy blocked"
                  : strategyLabel === "UNVERSIONED"
                    ? "Unversioned strategy"
                    : strategyLabel ?? "Unknown strategy"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${liveMarketData ? "bg-emerald-400" : "bg-zinc-600"}`} />
              <span className="text-zinc-400">
                {liveMarketData ? "Live market data" : "Mock market data"}
              </span>
            </div>
          </div>

          <div className="border-y border-zinc-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Actions
          </div>
          <div className="p-1">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new Event("fse:open-command-palette"));
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11px] text-zinc-300 transition-colors hover:bg-zinc-900/60"
            >
              <span>Command palette</span>
              <span className="font-mono text-[10px] text-zinc-600">{"\u2318"}K</span>
            </button>
            <a
              href="/system"
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11px] text-zinc-300 transition-colors hover:bg-zinc-900/60"
            >
              <span>System diagnostics</span>
              <span className="text-zinc-600">{"\u2192"}</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}