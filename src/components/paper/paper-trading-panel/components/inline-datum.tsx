export function InlineDatum({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-red-300"
        : "text-zinc-300";

  return (
    <div className="min-w-0 whitespace-nowrap text-center">
      <span className={tone === "neutral" ? "text-zinc-600" : toneClass}>
        {label}
      </span>
      <span className={"ml-1 font-mono tabular-nums " + toneClass}>
        {value}
      </span>
    </div>
  );
}