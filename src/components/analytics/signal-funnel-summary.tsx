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
      <header className="flex flex-col gap-3 border-b border-zinc-800 px-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <h2 id="signal-funnel-title" className="text-base font-semibold text-zinc-100">
            Signal Funnel
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Observability only - shows where opportunities are being filtered.
          </p>
        </div>
        <div className="flex w-fit rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5">
          {WINDOWS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setWindowKey(item)}
              className={
                item === windowKey
                  ? "rounded px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-950/40"
                  : "rounded px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-300"
              }
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Observations" value={summary.observations.toLocaleString()} />
          <Metric label="Executions" value={summary.executions.toLocaleString()} />
          <Metric label="Execute rate" value={`${executeRate}%`} />
        </div>
        <div className="flex justify-end">
          <Link
            href="/system#signal-funnel"
            className="text-xs font-medium text-zinc-400 transition-colors hover:text-emerald-300"
          >
            Detail funnel {"\u2192"}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-950/25 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-zinc-200">
        {value}
      </p>
    </div>
  );
}