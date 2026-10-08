import type { SymbolScanResult } from "@/scanner/scanner-result";
import { DirectionBadge, FreshnessBadge } from "@/components/common/badges";
import { formatPrice, formatRatio } from "@/lib/format";
import {
  workstationStatus,
  workstationToneClass,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";
import type { PaperDashboardData } from "@/paper/types";
export function SignalExecutiveSummary({
  result,
  paper,
}: {
  result: SymbolScanResult;
  paper?: PaperDashboardData;
}) {
  const status = workstationStatus(result);
  const risk = result.riskDetail;
  const planned = result.plannedLevels ?? null;
  const isPlanned = !risk && planned !== null;
  const entryVal = risk?.entryPrice ?? planned?.entry ?? null;
  const stopVal = risk?.stopLoss ?? planned?.stop ?? null;
  const tpVal = risk?.takeProfit1 ?? planned?.takeProfit ?? null;
  const rrVal = result.riskReward ?? risk?.plannedRR ?? planned?.rr ?? null;

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

      <OperationalSummary result={result} paper={paper} />


      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
        <Metric label={isPlanned ? "Planned entry" : "Entry"} value={formatPrice(result.symbol, entryVal)} />
        <Metric label={isPlanned ? "Planned stop" : "Stop"} value={formatPrice(result.symbol, stopVal)} />
        <Metric label={isPlanned ? "Planned target" : "Target"} value={formatPrice(result.symbol, tpVal)} />
        <Metric label={isPlanned ? "Min R:R" : "R:R"} value={formatRatio(rrVal)} />
      </dl>
      {isPlanned && (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
          Planned levels derived from the current setup zone. The Risk Engine will freeze the final entry, stop, and target once the trigger confirms.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-600">
        <span>Engine {result.executionDecision ?? "—"}</span>
        <span>Lifecycle {result.signalState ?? "—"}</span>
        <span>Setup {result.setupState ?? "—"}</span>
        <span>Trigger {result.triggerState ?? "—"}</span>
      </div>

      {result.strategyRouting && (
        <div
          aria-label="Strategy routing"
          className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/35 px-3 py-2.5"
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
            <span className="text-zinc-500">
              Regime <strong className="font-medium text-zinc-300">{result.strategyRouting.regime}</strong>
            </span>
            <span className="text-zinc-500">
              Preferred <strong className="font-medium text-zinc-300">{result.strategyRouting.preferredStrategyId ?? "WAIT"}</strong>
            </span>
            <span className="text-zinc-500">
              Active <strong className="font-medium text-zinc-300">{result.strategyId ?? "—"}</strong>
            </span>
            <span className="text-zinc-500">
              Route <strong className="font-medium text-zinc-300">{result.strategyRouting.mode}</strong>
            </span>
          </div>
          {result.strategyRouting.mode === "COMPATIBILITY_FALLBACK" && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-amber-300/80">
              {result.strategyRouting.reason}
            </p>
          )}
        </div>
      )}
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

function OperationalSummary({
  result,
  paper,
}: {
  result: SymbolScanResult;
  paper?: PaperDashboardData;
}) {
  const NA = "\u2014";
  const signalState = result.signalState ?? NA;
  const engineDecision = result.executionDecision ?? NA;

  const order = result.signalId
    ? paper?.recentOrders.find((item) => item.signalId === result.signalId) ?? null
    : null;
  const position = result.signalId
    ? paper?.openPositions.find((item) => item.signalId === result.signalId) ?? null
    : null;
  const trade = result.signalId
    ? paper?.recentTrades.find((item) => item.signalId === result.signalId) ?? null
    : null;

  let paperLabel = "NO ACTION";
  let paperTone = "text-zinc-500";
  if (!result.signalId) {
    paperLabel = "NOT APPLICABLE";
  } else if (position) {
    paperLabel = "OPEN";
    paperTone = "text-emerald-300";
  } else if (trade) {
    paperLabel = "CLOSED";
    paperTone = trade.realizedPnL >= 0 ? "text-emerald-300" : "text-red-300";
  } else if (order?.status === "FILLED") {
    paperLabel = "FILLED";
    paperTone = "text-sky-300";
  } else if (order?.status === "REJECTED") {
    paperLabel = "REJECTED";
    paperTone = "text-amber-300";
  } else if (order) {
    paperLabel = order.status;
    paperTone = "text-amber-300";
  } else if (
    result.executionDecision === "EXECUTE" &&
    result.signalState === "EXECUTE"
  ) {
    paperLabel = "PENDING";
    paperTone = "text-amber-300";
  }

  return (
    <div
      aria-label="Operational summary"
      className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 sm:grid-cols-4"
    >
      <SummaryCell label="Signal" value={signalState} />
      <SummaryCell label="Engine" value={engineDecision} />
      <SummaryCell label="Paper" value={paperLabel} valueClassName={paperTone} />
      <a
        href="/system"
        className="bg-[#0b0e14] px-3 py-2.5 transition-colors hover:bg-zinc-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <span className="text-[11px] uppercase tracking-wide text-zinc-600">
          Broker
        </span>
        <span className="mt-1 block font-mono text-xs text-sky-300">
          Open System {"\u203A"}
        </span>
      </a>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="bg-[#0b0e14] px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-zinc-600">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-xs text-zinc-200",
          valueClassName
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
