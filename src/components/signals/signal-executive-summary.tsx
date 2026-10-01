import type { SymbolScanResult } from "@/scanner/scanner-result";
import { DirectionBadge, FreshnessBadge } from "@/components/common/badges";
import { formatPrice, formatRatio } from "@/lib/format";
import {
  stageGlyph,
  workstationStages,
  workstationStatus,
  workstationToneClass,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

export function SignalExecutiveSummary({
  result,
}: {
  result: SymbolScanResult;
}) {
  const status = workstationStatus(result);
  const stages = workstationStages(result);
  const risk = result.riskDetail;

  return (
    <section
      aria-labelledby="signal-summary-title"
      className="rounded-lg border border-zinc-800 bg-[#0b0e14]/65 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="signal-summary-title"
              className="font-mono text-lg font-semibold tracking-wide text-zinc-100"
            >
              {result.symbol}
            </h3>
            <DirectionBadge direction={result.biasDirection} />
            <FreshnessBadge status={result.freshness} />
          </div>

          <div className={cn("mt-3 text-lg font-semibold", workstationToneClass(status.tone))}>
            {status.headline}
          </div>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-500">
            {status.detail}
          </p>
        </div>

        <div className="text-right">
          <div className="text-[11px] text-zinc-600">Current price</div>
          <div className="mt-1 font-mono text-base font-semibold tabular-nums text-zinc-100">
            {formatPrice(result.symbol, result.latestPrice)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1">
        {stages.map((stage) => (
          <div key={stage.label} className="min-w-0">
            <div
              className={cn(
                "h-1 rounded-full",
                stage.state === "done" && "bg-emerald-500/70",
                stage.state === "current" && "bg-amber-500/70",
                stage.state === "blocked" && "bg-red-500/70",
                stage.state === "pending" && "bg-zinc-800"
              )}
            />
            <div
              className={cn(
                "mt-1.5 truncate text-[10px] sm:text-[11px]",
                stage.state === "done" && "text-emerald-300",
                stage.state === "current" && "text-amber-300",
                stage.state === "blocked" && "text-red-300",
                stage.state === "pending" && "text-zinc-600"
              )}
            >
              {stageGlyph(stage)} {stage.label}
            </div>
          </div>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
        <Metric label="Entry" value={formatPrice(result.symbol, risk?.entryPrice ?? null)} />
        <Metric label="Stop" value={formatPrice(result.symbol, risk?.stopLoss ?? null)} />
        <Metric label="Target" value={formatPrice(result.symbol, risk?.takeProfit1 ?? null)} />
        <Metric label="R:R" value={formatRatio(result.riskReward ?? risk?.plannedRR ?? null)} />
      </dl>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-600">
        <span>Engine {result.executionDecision ?? "—"}</span>
        <span>Lifecycle {result.signalState ?? "—"}</span>
        <span>Setup {result.setupState ?? "—"}</span>
        <span>Trigger {result.triggerState ?? "—"}</span>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0b0e14] px-3 py-2.5">
      <dt className="text-[11px] text-zinc-600">{label}</dt>
      <dd className="mt-1 font-mono text-xs tabular-nums text-zinc-200">{value}</dd>
    </div>
  );
}
