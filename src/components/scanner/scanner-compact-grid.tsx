"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import { DirectionBadge } from "@/components/common/badges";
import {
  formatPrice,
  formatRatio,
  formatScore,
} from "@/lib/format";
import {
  stageGlyph,
  workstationStages,
  workstationStatus,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

function isFailed(result: SymbolScanResult): boolean {
  return result.status !== "ANALYSED" && result.status !== "ANALYSED_PARTIAL";
}

function statusBadge(result: SymbolScanResult): {
  icon: string;
  label: string;
  tone: string;
} {
  if (result.executionDecision === "EXECUTE") {
    return { icon: "\u25B6", label: "EXEC", tone: "text-emerald-300" };
  }
  if (result.executionDecision === "BLOCKED") {
    return { icon: "\u26D4", label: "BLOCK", tone: "text-red-300" };
  }
  if (result.executionDecision === "INVALIDATED") {
    return { icon: "\u26A0", label: "FAIL", tone: "text-zinc-500" };
  }
  if (result.signalState === "ARMED") {
    return { icon: "\u26A1", label: "ARMED", tone: "text-amber-300" };
  }
  if (result.executionDecision === "WAIT" || result.signalState === "WATCH") {
    return { icon: "\u23F8", label: "WAIT", tone: "text-amber-300" };
  }
  return { icon: "\u2500", label: "NONE", tone: "text-zinc-500" };
}

function setupChipClass(score: number | null): string {
  if (score === null || !Number.isFinite(score)) {
    return "border-zinc-700 bg-zinc-900/50 text-zinc-400";
  }
  if (score >= 80) {
    return "border-emerald-700/70 bg-emerald-950/25 text-emerald-300";
  }
  if (score >= 60) {
    return "border-amber-700/70 bg-amber-950/25 text-amber-300";
  }
  return "border-rose-800/70 bg-rose-950/25 text-rose-300";
}

function borderTone(tone: string): string {
  if (tone === "ready") return "border-l-emerald-500";
  if (tone === "waiting") return "border-l-amber-500";
  if (tone === "blocked") return "border-l-red-500";
  return "border-l-zinc-700";
}

function stageToneClass(state: string): string {
  if (state === "done") return "text-emerald-400";
  if (state === "current") return "text-amber-300";
  if (state === "blocked") return "text-red-400";
  return "text-zinc-700";
}

export function ScannerCompactGrid({
  results,
  selectedSymbol,
  onSelect,
}: {
  results: SymbolScanResult[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 p-2 lg:grid-cols-4">
      {results.map((result) => (
        <CompactCard
          key={result.symbol}
          result={result}
          selected={result.symbol === selectedSymbol}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function CompactCard({
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
  const failed = isFailed(result);
  const badge = statusBadge(result);
  const risk = result.riskDetail;
  const planned = result.plannedLevels ?? null;
  const entryVal = risk?.entryPrice ?? planned?.entry ?? null;
  const tpVal = risk?.takeProfit1 ?? planned?.takeProfit ?? null;
  const slVal = risk?.stopLoss ?? planned?.stop ?? null;
  const rrVal = result.riskReward ?? risk?.plannedRR ?? planned?.rr ?? null;

  return (
    <button
      type="button"
      data-signal-symbol={result.symbol}
      onClick={() => onSelect(result.symbol)}
      aria-pressed={selected}
      aria-label={`Open signal detail for ${result.symbol}`}
      className={cn(
        "min-w-0 rounded border border-zinc-800 border-l-2 bg-zinc-950/20 px-2.5 py-2 text-left transition-colors hover:bg-zinc-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600",
        borderTone(status.tone),
        selected && "ring-1 ring-emerald-700/50"
      )}
    >
      {/* Header: symbol + direction + score */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-sm font-semibold tracking-wide text-zinc-100">
          {result.symbol}
        </span>
        <DirectionBadge direction={result.biasDirection} className="text-[10px]" />
        <span
          className={cn(
            "ml-auto rounded border px-1 py-0 font-mono text-[10px] font-semibold tabular-nums",
            setupChipClass(result.setupScore)
          )}
        >
          {formatScore(result.setupScore)}
        </span>
      </div>

      {/* Price */}
      <div className="mt-1 font-mono text-base font-semibold tabular-nums text-zinc-100">
        {formatPrice(result.symbol, result.latestPrice)}
      </div>

      {/* Stage progress bar */}
      <div className="mt-1 flex items-center gap-1 font-mono text-[11px]">
        {stages.map((stage) => (
          <span
            key={stage.label}
            title={`${stage.label} \u00B7 ${stage.state}`}
            aria-label={`${stage.label}: ${stage.state}`}
            className={cn("leading-none", stageToneClass(stage.state))}
          >
            {stageGlyph(stage)}
          </span>
        ))}
      </div>

      {/* Compact levels (kalau gak failed) */}
      {!failed && (
        <>
          <div className="mt-1.5 space-y-0.5 font-mono text-[10px] leading-tight">
            <div className="flex justify-between gap-1">
              <span className="text-zinc-500">Entry</span>
              <span className="tabular-nums text-zinc-200">
                {formatPrice(result.symbol, entryVal)}
              </span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="text-zinc-500">TP</span>
              <span className="tabular-nums text-emerald-300">
                {formatPrice(result.symbol, tpVal)}
              </span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="text-zinc-500">SL</span>
              <span className="tabular-nums text-red-300">
                {formatPrice(result.symbol, slVal)}
              </span>
            </div>
            <div className="flex justify-between gap-1">
              <span className="text-zinc-500">R:R</span>
              <span className="tabular-nums text-zinc-300">
                {formatRatio(rrVal)}
              </span>
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px]">
            <span
              className={cn("flex items-center gap-1 font-medium", badge.tone)}
            >
              <span aria-hidden="true">{badge.icon}</span>
              <span>{badge.label}</span>
            </span>
            {result.signalState && (
              <span className="truncate font-mono text-zinc-500">
                {result.signalState}
              </span>
            )}
          </div>
        </>
      )}

      {failed && (
        <div className="mt-1.5 font-mono text-[10px] text-zinc-600">
          Engine status {result.status.replaceAll("_", " ")}
        </div>
      )}
    </button>
  );
}