"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import {
  DirectionBadge,
  FreshnessBadge,
} from "@/components/common/badges";
import { BIAS_DISPLAY } from "@/lib/signal-meta";
import {
  formatPrice,
  formatRatio,
  formatScore,
  formatTimeShort,
} from "@/lib/format";
import {
  stageGlyph,
  workstationStages,
  workstationStatus,
  workstationToneClass,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

export function ScannerCards({
  results,
  selectedSymbol,
  onSelect,
}: {
  results: SymbolScanResult[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  return (
    <ul className="divide-y divide-zinc-800/80">
      {results.map((result) => (
        <ScannerCard
          key={result.symbol}
          result={result}
          selected={result.symbol === selectedSymbol}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function ScannerCard({
  result,
  selected,
  onSelect,
}: {
  result: SymbolScanResult;
  selected: boolean;
  onSelect: (symbol: string) => void;
}) {
  const status = workstationStatus(result);
  const stages = workstationStages(result);
  const failed = result.status !== "ANALYSED";

  return (
    <li
      className={cn(
        "border-l-2 transition-colors",
        status.tone === "ready"
          ? "border-l-emerald-500"
          : status.tone === "waiting"
            ? "border-l-amber-500"
            : status.tone === "blocked"
              ? "border-l-red-500"
              : "border-l-zinc-800",
        selected && "bg-zinc-800/45"
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(result.symbol)}
        aria-pressed={selected}
        aria-label={`Open signal detail for ${result.symbol}`}
        className="w-full px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
          <div className="min-w-0">
            <div className="font-mono text-lg font-semibold leading-none tracking-wide text-zinc-100">
              {result.symbol}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <DirectionBadge direction={result.biasDirection} className="text-[10px]" />
              <FreshnessBadge status={result.freshness} className="text-[9px]" />
            </div>
          </div>

          <div className="min-w-[7.5rem] text-right">
            <div className="font-mono text-lg font-semibold leading-none tabular-nums text-zinc-100">
              {formatPrice(result.symbol, result.latestPrice)}
            </div>
            <div className="mt-2 font-mono text-[11px] tabular-nums text-zinc-600">
              {formatTimeShort(result.updatedAt)}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-zinc-800/70 pt-3.5">
          <div className={cn("text-base font-semibold", workstationToneClass(status.tone))}>
            {status.headline}
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-zinc-500">
            {status.detail}
          </p>
        </div>

        {failed ? (
          <div className="mt-3 rounded-md border border-zinc-800/70 bg-zinc-950/25 px-3 py-2 font-mono text-[10px] text-zinc-600">
            Engine status {result.status.replaceAll("_", " ")}
          </div>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-zinc-800/70 overflow-hidden rounded-md border border-zinc-800/70 bg-zinc-950/20">
              <CompactMetric
                label="Bias"
                value={result.bias ? BIAS_DISPLAY[result.bias] : "—"}
              />
              <CompactMetric label="Setup" value={formatScore(result.setupScore)} />
              <CompactMetric label="R:R" value={formatRatio(result.riskReward)} />
            </dl>

            <div className="mt-3 grid grid-cols-5 gap-1 border-t border-zinc-800/60 pt-3">
              {stages.map((stage) => (
                <div
                  key={stage.label}
                  className={cn(
                    "min-w-0 text-center text-[10px] font-medium leading-tight",
                    stage.state === "done" && "text-emerald-300",
                    stage.state === "current" && "text-amber-300",
                    stage.state === "blocked" && "text-red-300",
                    stage.state === "pending" && "text-zinc-600"
                  )}
                >
                  <div className="truncate">{stage.label}</div>
                  <div className="mt-1 font-mono text-[11px]">{stageGlyph(stage)}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-center font-mono text-[10px] leading-relaxed text-zinc-600">
              Engine {result.executionDecision ?? "—"} · Lifecycle {result.signalState ?? "—"}
            </div>
          </>
        )}

        <div className="relative mt-3 flex items-center justify-center border-t border-zinc-800/60 pt-3 text-xs font-semibold text-zinc-300">
          <span>View analysis</span>
          <span aria-hidden="true" className="absolute right-0 text-zinc-600">›</span>
        </div>
      </button>
    </li>
  );
}

function CompactMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 px-2 py-2.5 text-center">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-xs text-zinc-300">
        {value}
      </dd>
    </div>
  );
}
