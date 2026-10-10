import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import { formatNumber } from "../lib/formatters";

export function EquityCurve({ artifact }: { artifact: BacktestRunArtifact }) {
  const points = artifact.analytics.equityCurve;
  if (points.length < 2) {
    return (
      <section className="rounded-md border border-zinc-800 bg-zinc-900/30 p-3 text-xs text-zinc-600">
        Equity curve needs at least two replay marks.
      </section>
    );
  }

  const width = 1000;
  const height = 220;
  const pad = 12;
  const values = points.map((point) => point.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-9, max - min);
  const firstAt = points[0].asOf;
  const lastAt = points[points.length - 1].asOf;
  const timeRange = Math.max(1, lastAt - firstAt);

  const path = points
    .map((point, index) => {
      const x =
        pad + ((point.asOf - firstAt) / timeRange) * (width - pad * 2);
      const y =
        height -
        pad -
        ((point.equity - min) / range) * (height - pad * 2);
      return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Equity curve</h2>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Mark-to-market replay equity · includes floating P/L
          </p>
        </div>
        <span className="font-mono text-[11px] text-zinc-500">
          {formatNumber(min, 2)} → {formatNumber(max, 2)}
        </span>
      </header>
      <div className="overflow-hidden p-2">
        <svg
          viewBox={"0 0 " + width + " " + height}
          role="img"
          aria-label="Historical mark-to-market equity curve"
          className="h-48 w-full"
          preserveAspectRatio="none"
        >
          <line
            x1={pad}
            y1={height / 2}
            x2={width - pad}
            y2={height / 2}
            stroke="rgb(63 63 70)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke="rgb(52 211 153)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </section>
  );
}