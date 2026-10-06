"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  SIGNAL_FUNNEL_STAGES,
  type SignalFunnelDashboard,
  type SignalFunnelStage,
  type SignalFunnelWindow,
} from "@/analytics/signal-funnel";

const STAGE_LABELS: Record<SignalFunnelStage, string> = {
  SCANNED: "Scanned",
  DATA_VALID: "Data valid",
  BIAS_DIRECTIONAL: "Directional bias",
  SETUP_ACTIONABLE: "Setup actionable",
  TRIGGER_CONFIRMED: "Trigger confirmed",
  RISK_APPROVED: "Risk approved",
  NO_HARD_VETO: "No hard veto",
  EXECUTE: "Execute",
};

const WINDOWS: SignalFunnelWindow[] = ["24H", "7D", "30D"];

export function SignalFunnelPanel({
  analytics,
  persistenceError,
  onReset,
  resetting = false,
}: {
  analytics: SignalFunnelDashboard | null | undefined;
  persistenceError?: string | null;
  /** Optional reset handler. When provided, a Reset button is rendered. */
  onReset?: () => void;
  /** True while a reset request is in flight. Disables the button. */
  resetting?: boolean;
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
        <div>
          <h2 id="signal-funnel-title" className="text-base font-semibold text-zinc-100">
            Signal Funnel + Rejection Analytics
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Observability only — shows where opportunities are being filtered without changing strategy decisions.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          {onReset && (
            <button
              type="button"
              disabled={resetting}
              onClick={onReset}
              className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-red-800/60 hover:bg-red-950/20 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetting ? "Resetting..." : "Reset"}
            </button>
          )}
        </div>
      </header>

      {persistenceError && (
        <div
          role="alert"
          className="border-b border-amber-900/50 bg-amber-950/15 px-3 py-2 text-xs text-amber-200 sm:px-4"
        >
          Analytics persistence warning: {persistenceError}
        </div>
      )}

      <div className="grid gap-4 p-3 sm:p-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Observations" value={summary.observations.toLocaleString()} />
            <Metric label="Executions" value={summary.executions.toLocaleString()} />
            <Metric label="Execute rate" value={`${executeRate}%`} />
          </div>

          <div className="overflow-hidden rounded-md border border-zinc-800/80">
            <div className="grid grid-cols-[minmax(120px,1fr)_70px_80px_70px] border-b border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-600">
              <span>Stage</span>
              <span className="text-right">Passed</span>
              <span className="text-right">Conv.</span>
              <span className="text-right">Drop</span>
            </div>
            {SIGNAL_FUNNEL_STAGES.map((stage) => {
              const stat = summary.stageStats.find((item) => item.stage === stage);
              if (!stat) return null;
              return (
                <div
                  key={stage}
                  className="grid grid-cols-[minmax(120px,1fr)_70px_80px_70px] items-center border-b border-zinc-800/60 px-3 py-2.5 text-xs last:border-b-0"
                >
                  <span className="truncate font-medium text-zinc-300">
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="text-right font-mono tabular-nums text-zinc-200">
                    {stat.count}
                  </span>
                  <span className="text-right font-mono tabular-nums text-zinc-500">
                    {stat.conversionRate === null ? "—" : `${stat.conversionRate}%`}
                  </span>
                  <span
                    className={
                      stat.dropOff > 0
                        ? "text-right font-mono tabular-nums text-amber-300"
                        : "text-right font-mono tabular-nums text-zinc-600"
                    }
                  >
                    {stat.dropOff > 0 ? `-${stat.dropOff}` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-md border border-zinc-800/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Downstream execution
              </h3>
              <span className="text-[11px] text-zinc-600">
                {summary.downstream.brokerUnavailable ? "broker unavailable" : "paper + broker"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DownstreamCell
                label="Paper filled"
                value={summary.downstream.paperFilled}
                tone="positive"
              />
              <DownstreamCell
                label="Paper rejected"
                value={summary.downstream.paperRejected}
                tone={summary.downstream.paperRejected > 0 ? "warning" : "muted"}
              />
              <DownstreamCell
                label="Broker pending"
                value={summary.downstream.brokerPending}
                tone="muted"
              />
              <DownstreamCell
                label="Broker rejected"
                value={summary.downstream.brokerRejected}
                tone="muted"
              />
            </div>
            {summary.downstream.paperRejectionReasons.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-zinc-800/70 pt-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-600">
                  Paper rejection reasons
                </p>
                {summary.downstream.paperRejectionReasons.slice(0, 4).map((reason) => (
                  <div key={reason.code} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate font-mono text-zinc-400">{reason.code}</span>
                    <span className="shrink-0 font-mono tabular-nums text-zinc-300">{reason.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-800/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Top rejection reasons
              </h3>
              <span className="text-[11px] text-zinc-600">share of rejections</span>
            </div>
            {summary.rejectionReasons.length === 0 ? (
              <p className="py-3 text-xs text-zinc-600">No rejected observations in this window.</p>
            ) : (
              <div className="space-y-2">
                {summary.rejectionReasons.slice(0, 8).map((reason) => (
                  <div key={reason.code} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-zinc-300">
                        {reason.code}
                      </p>
                      <p className="text-[11px] text-zinc-600">
                        {STAGE_LABELS[reason.stage]}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-xs tabular-nums text-zinc-200">{reason.count}</p>
                      <p className="font-mono text-[11px] tabular-nums text-zinc-600">
                        {reason.percentage}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-800/80 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Strategy routing
            </h3>
            {summary.strategyRoutingStats.length === 0 ? (
              <p className="py-2 text-xs text-zinc-600">No strategy routing observations yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.strategyRoutingStats.slice(0, 8).map((item) => (
                  <div
                    key={`${item.preferredStrategyId}|${item.selectedStrategyId}|${item.routingMode}`}
                    className="grid grid-cols-[minmax(0,1fr)_60px] gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-zinc-300">
                        {item.preferredStrategyId} → {item.selectedStrategyId}
                      </p>
                      <p className="truncate text-[11px] text-zinc-600">
                        {item.routingMode} · {item.executionRate}% exec
                      </p>
                    </div>
                    <span className="text-right font-mono tabular-nums text-zinc-300">
                      {item.observations}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-zinc-800/80 p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Regime distribution
            </h3>
            {summary.regimeStats.length === 0 ? (
              <p className="py-2 text-xs text-zinc-600">No regime observations yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.regimeStats.slice(0, 8).map((item) => (
                  <div
                    key={item.regime}
                    className="grid grid-cols-[minmax(0,1fr)_60px_68px] items-center gap-2 text-[11px]"
                  >
                    <span className="truncate text-zinc-400">{item.regime}</span>
                    <span className="text-right font-mono tabular-nums text-zinc-300">
                      {item.observations}
                    </span>
                    <span className="text-right font-mono tabular-nums text-zinc-600">
                      {item.executionRate}% exec
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}


function DownstreamCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "warning" | "muted";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : "text-zinc-400";
  return (
    <div className="rounded border border-zinc-800/60 bg-zinc-950/30 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className={cn("mt-1 font-mono text-sm font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800/80 bg-zinc-950/25 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-zinc-200">{value}</p>
    </div>
  );
}
