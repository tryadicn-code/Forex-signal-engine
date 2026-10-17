import type { PaperTrade } from "@/paper/types";
import { rDistribution } from "../lib/charts";

export function RDistribution({ trades }: { trades: PaperTrade[] }) {
  if (trades.length < 3) {
    return (
      <div className="border-t border-zinc-800 px-3 py-3 text-center text-[11px] text-zinc-600">
        R distribution appears after 3+ closed trades.
      </div>
    );
  }

  const buckets = rDistribution(trades);
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const width = 300;
  const height = 60;
  const pad = 6;
  const barGap = 4;
  const barCount = buckets.length;
  const barWidth = (width - pad * 2 - barGap * (barCount - 1)) / barCount;
  const chartHeight = height - pad * 2;

  return (
    <div className="border-t border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          R distribution
        </h3>
        <span className="font-mono text-[11px] text-zinc-600">
          {trades.length} trades
        </span>
      </div>
      <div className="px-3 pb-2">
        <svg
          viewBox={"0 0 " + width + " " + height}
          role="img"
          aria-label="R-multiple distribution across closed trades"
          className="h-16 w-full"
          preserveAspectRatio="none"
        >
          {buckets.map((bucket, i) => {
            const x = pad + i * (barWidth + barGap);
            const barHeight =
              bucket.count === 0 ? 0 : (bucket.count / maxCount) * chartHeight;
            const y = height - pad - barHeight;
            const fill =
              bucket.kind === "win"
                ? "rgb(52 211 153)"
                : bucket.kind === "loss"
                  ? "rgb(248 113 113)"
                  : "rgb(113 113 122)";
            return (
              <rect
                key={bucket.label}
                x={x.toFixed(2)}
                y={y.toFixed(2)}
                width={barWidth.toFixed(2)}
                height={barHeight.toFixed(2)}
                fill={fill}
                fillOpacity={bucket.count === 0 ? 0.15 : 0.85}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        <div className="mt-1 grid grid-cols-7 gap-1 font-mono text-[10px] text-zinc-600">
          {buckets.map((bucket) => (
            <div key={bucket.label} className="text-center">
              <div className="text-zinc-400">{bucket.label}</div>
              <div
                className={
                  bucket.kind === "win"
                    ? "text-emerald-400"
                    : bucket.kind === "loss"
                      ? "text-red-400"
                      : "text-zinc-500"
                }
              >
                {bucket.count}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
