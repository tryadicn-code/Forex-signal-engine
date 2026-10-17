export function metric(
  label: string,
  value: string,
  note?: string,
  tone: "neutral" | "positive" | "negative" = "neutral",
  suffix?: string
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
        {suffix && (
          <span className="ml-1 text-[11px] font-normal text-zinc-500">
            {suffix}
          </span>
        )}
      </div>
      {note && <div className="mt-1 text-[11px] text-zinc-600">{note}</div>}
    </div>
  );
}

/**
 * Inline variant of metric() for compact flex layouts.
 * Renders as a single inline-flex span instead of a bordered tile.
 */
export function metricInline(
  label: string,
  value: string,
  note?: string,
  tone: "neutral" | "positive" | "negative" = "neutral",
  suffix?: string
): React.ReactNode {
  const valueClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-red-300"
        : "text-zinc-200";

  return (
    <span className="inline-flex items-baseline gap-1 font-mono text-[11px] tabular-nums">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className={"font-semibold " + valueClass}>{value}</span>
      {suffix && <span className="text-[10px] text-zinc-500">{suffix}</span>}
      {note && <span className="text-[10px] text-zinc-600">{note}</span>}
    </span>
  );
}
