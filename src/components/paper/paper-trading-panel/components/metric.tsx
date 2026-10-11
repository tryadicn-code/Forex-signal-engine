export function metric(
  label: string,
  value: string,
  note?: string,
  tone: "neutral" | "positive" | "negative" = "neutral"
): React.ReactNode {
  const valueClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-red-300"
        : "text-zinc-100";

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/35 px-3 py-2.5">
      <div className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div className={"mt-1 font-mono text-sm font-semibold tabular-nums " + valueClass}>
        {value}
      </div>
      {note && <div className="mt-1 text-[11px] text-zinc-600">{note}</div>}
    </div>
  );
}