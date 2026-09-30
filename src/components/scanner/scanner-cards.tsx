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
        "border-l-2 px-3 py-3 transition-colors",
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
        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-base font-semibold tracking-wide text-zinc-100">
              {result.symbol}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <DirectionBadge direction={result.biasDirection} className="text-[10px]" />
              <FreshnessBadge status={result.freshness} className="text-[9px]" />
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-base font-semibold tabular-nums text-zinc-100">
              {formatPrice(result.symbol, result.latestPrice)}
            </div>
            <div className="mt-1 font-mono text-[11px] tabular-nums text-zinc-600">
              {formatTimeShort(result.updatedAt)}
            </div>
          </div>
        </div>

        <div className="mt-3 border-t border-zinc-800/70 pt-3">
          <div className={cn("text-sm font-semibold", workstationToneClass(status.tone))}>
            {status.headline}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
            {status.detail}
          </p>
        </div>

        {failed && (
          <div className="mt-2 font-mono text-[10px] text-zinc-600">
            Engine status {result.status.replaceAll("_", " ")}
          </div>
        )}

        {!failed && (
          <>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <CompactMetric
                label="Bias"
                value={result.bias ? BIAS_DISPLAY[result.bias] : "—"}
              />
              <CompactMetric label="Setup" value={formatScore(result.setupScore)} />
              <CompactMetric label="R:R" value={formatRatio(result.riskReward)} />
            </dl>

            <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 border-t border-zinc-800/60 pt-2 text-[11px]">
              {stages.map((stage) => (
                <span
                  key={stage.label}
                  className={cn(
                    stage.state === "done" && "text-emerald-300",
                    stage.state === "current" && "text-amber-300",
                    stage.state === "blocked" && "text-red-300",
                    stage.state === "pending" && "text-zinc-600"
                  )}
                >
                  {stage.label} {stageGlyph(stage)}
                </span>
              ))}
            </div>

            <div className="mt-2 font-mono text-[10px] text-zinc-600">
              Engine {result.executionDecision ?? "—"} · Lifecycle {result.signalState ?? "—"}
            </div>
          </>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-zinc-800/60 pt-2.5 text-xs font-medium text-zinc-300">
          <span>View analysis</span>
          <span aria-hidden="true" className="text-zinc-600">›</span>
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
    <div className="min-w-0">
      <dt className="text-[11px] text-zinc-600">{label}</dt>
      <dd className="mt-0.5 min-h-5 truncate font-mono text-xs text-zinc-300">
        {value}
      </dd>
    </div>
  );
}
