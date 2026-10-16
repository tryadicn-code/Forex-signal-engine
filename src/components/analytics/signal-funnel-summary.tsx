"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type SignalFunnelDashboard,
  type SignalFunnelWindow,
} from "@/analytics/signal-funnel";

const WINDOWS: SignalFunnelWindow[] = ["24H", "7D", "30D"];

export function SignalFunnelSummary({
  analytics,
}: {
  analytics: SignalFunnelDashboard | null | undefined;
}) {
  const [windowKey, setWindowKey] = useState<SignalFunnelWindow>("24H");
  const summary = analytics?.windows[windowKey] ?? null;

  const executeRate = useMemo(() => {
    if (!summary || summary.observations === 0) return 0;
    return Math.round((summary.executions / summary.observations) * 10000) / 100;
  }, [summary]);

  if (!summary) {
    return null;
  }

  return (
    <section
      id="analytics"
      aria-labelledby="signal-funnel-title"
      className="scroll-mt-20 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/25"
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <h2
          id="signal-funnel-title"
          className="text-sm font-semibold text-zinc-100"
        >
          Signal Funnel
        </h2>
        <div className="flex rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5">
          {WINDOWS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setWindowKey(item)}
              className={
                item === windowKey
                  ? "rounded px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-300 bg-emerald-950/40"
                  : "rounded px-2 py-0.5 font-mono text-[10px] text-zinc-500 hover:text-zinc-300"
              }
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] tabular-nums">
          <span className="text-zinc-300">
            {summary.observations.toLocaleString()}
            <span className="text-zinc-600">{" obs"}</span>
          </span>
          <span aria-hidden="true" className="text-zinc-700">
            {"\u00B7"}
          </span>
          <span className="text-zinc-300">
            {summary.executions.toLocaleString()}
            <span className="text-zinc-600">{" exec"}</span>
          </span>
          <span aria-hidden="true" className="text-zinc-700">
            {"\u00B7"}
          </span>
          <span className="text-zinc-300">
            {executeRate}%
            <span className="text-zinc-600">{" rate"}</span>
          </span>
        </div>
        <Link
          href="/system#signal-funnel"
          className="shrink-0 text-[10px] font-medium text-zinc-400 transition-colors hover:text-emerald-300"
        >
          Detail {"\u2192"}
        </Link>
      </div>
    </section>
  );
}
