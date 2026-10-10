export function MiniBar({
  label,
  value,
  max,
  display,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  tone: "positive" | "negative" | "warn" | "muted";
}) {
  const pct = Math.max(0, Math.min(1, Math.abs(value) / max));
  const fill =
    tone === "positive"
      ? "bg-emerald-500"
      : tone === "negative"
        ? "bg-red-500"
        : tone === "warn"
          ? "bg-amber-500"
          : "bg-zinc-600";
  const text =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-red-300"
        : tone === "warn"
          ? "text-amber-300"
          : "text-zinc-500";
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-7 shrink-0 font-mono uppercase tracking-wider text-zinc-600">
        {label}
      </span>
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={"h-full " + fill}
          style={{ width: (pct * 100).toFixed(1) + "%" }}
        />
      </div>
      <span className={"w-12 shrink-0 text-right font-mono " + text}>
        {display}
      </span>
    </div>
  );
}