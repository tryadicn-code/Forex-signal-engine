import { cn } from "@/lib/utils";

export function TradeFilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-md border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wide transition-colors",
        active
          ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-300"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
      )}
    >
      {children}
    </button>
  );
}