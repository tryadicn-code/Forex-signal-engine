import { useState } from "react";
import type { PaperTrade } from "@/paper/types";
import { cn } from "@/lib/utils";
import { curvePoints } from "../lib/charts";
import type { EquityCurveMode } from "../lib/types";

export function EquityCurve({
  trades,
  initialBalance,
  currency,
}: {
  trades: PaperTrade[];
  initialBalance: number;
  currency: string;
}) {
  const [mode, setMode] = useState<EquityCurveMode>("usd");

  if (trades.length < 2) {
    return (
      <div className="border-t border-zinc-800 px-3 py-3 text-center text-[11px] text-zinc-600">
        Equity curve appears after 2+ closed trades.
      </div>
    );
  }

  const isUsd = mode === "usd";
  const baseline = isUsd ? initialBalance : 0;
  const metric: (t: PaperTrade) => number = isUsd
    ? (t) => t.realizedPnL
    : (t) => t.realizedR;
  const points = curvePoints(trades, baseline, metric);
  const width = 300;
  const height = 80;
  const pad = 6;
  const values = points.map((p) => p.value);
  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  const range = max - min || 1;
  const maxT = points.length - 1 || 1;
  const finalValue = points[points.length - 1].value;
  const positive = finalValue >= baseline;
  const strokeColor = positive ? "rgb(52 211 153)" : "rgb(248 113 113)";
  const baselineY =
    height - pad - ((baseline - min) / range) * (height - pad * 2);

  const fmt = (v: number) =>
    isUsd
      ? currency + " " + v.toFixed(2)
      : (v >= 0 ? "+" : "") + v.toFixed(2) + "R";

  const path = points
    .map((p, i) => {
      const x = pad + (p.t / maxT) * (width - pad * 2);
      const y = height - pad - ((p.value - min) / range) * (height - pad * 2);
      return (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");

  return (
    <div className="border-t border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Equity curve
          </h3>
          <div className="flex gap-0.5">
            {(["usd", "r"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  mode === m
                    ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-300"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                )}
              >
                {m === "usd" ? "USD" : "R"}
              </button>
            ))}
          </div>
        </div>
        <span className="font-mono text-[11px] text-zinc-600">
          {fmt(min)} → {fmt(max)}
        </span>
      </div>
      <div className="px-3 pb-3">
        <svg
          viewBox={"0 0 " + width + " " + height}
          role="img"
          aria-label={
            isUsd
              ? "Paper trading equity curve in account currency"
              : "Paper trading cumulative R curve"
          }
          className="h-20 w-full"
          preserveAspectRatio="none"
        >
          <line
            x1={pad}
            y1={baselineY}
            x2={width - pad}
            y2={baselineY}
            stroke="rgb(63 63 70)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
          <span>Start {fmt(baseline)}</span>
          <span className={positive ? "text-emerald-300" : "text-red-300"}>
            Now {fmt(finalValue)}
          </span>
        </div>
      </div>
    </div>
  );
}