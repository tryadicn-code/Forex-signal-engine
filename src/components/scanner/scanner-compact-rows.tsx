"use client";

import { useState } from "react";
import type { SymbolScanResult } from "@/scanner/scanner-result";
import { DirectionBadge } from "@/components/common/badges";
import { formatPrice, formatScore } from "@/lib/format";
import { workstationStatus } from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

function isNeutralWithoutLevels(result: SymbolScanResult): boolean {
  if (result.status !== "ANALYSED" && result.status !== "ANALYSED_PARTIAL") {
    return false;
  }
  const neutralBias =
    result.biasDirection === null || result.biasDirection === "NEUTRAL";
  if (!neutralBias) return false;
  const risk = result.riskDetail;
  const planned = result.plannedLevels;
  const hasRiskLevel =
    risk?.entryPrice != null ||
    risk?.takeProfit1 != null ||
    risk?.stopLoss != null;
  const hasPlannedLevel =
    planned?.entry != null ||
    planned?.takeProfit != null ||
    planned?.stop != null ||
    planned?.rr != null;
  return !hasRiskLevel && !hasPlannedLevel && result.riskReward == null;
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

export function ScannerCompactRows({
  results,
  selectedSymbol,
  onSelect,
}: {
  results: SymbolScanResult[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  const [neutralCollapsed, setNeutralCollapsed] = useState(true);

  const activeResults = results.filter((r) => !isNeutralWithoutLevels(r));
  const neutralResults = results.filter((r) => isNeutralWithoutLevels(r));

  return (
    <>
      {activeResults.length > 0 && (
        <ul>
          {activeResults.map((result) => (
            <CompactRow
              key={result.symbol}
              result={result}
              selected={result.symbol === selectedSymbol}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}

      {neutralResults.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setNeutralCollapsed((v) => !v)}
            aria-expanded={!neutralCollapsed}
            className="flex w-full items-center gap-2 border-b border-zinc-700/80 bg-zinc-950/40 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500 transition-colors hover:bg-zinc-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
          >
            <span aria-hidden="true" className="font-mono text-zinc-400">
              {neutralCollapsed ? "\u25B8" : "\u25BE"}
            </span>
            <span>{"Neutral pairs \u00B7 "}{neutralResults.length}</span>
          </button>

          {!neutralCollapsed && (
            <ul>
              {neutralResults.map((result) => (
                <CompactRow
                  key={result.symbol}
                  result={result}
                  selected={result.symbol === selectedSymbol}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function CompactRow({
  result,
  selected,
  onSelect,
}: {
  result: SymbolScanResult;
  selected: boolean;
  onSelect: (symbol: string) => void;
}) {
  const status = workstationStatus(result);
  const partial = result.status === "ANALYSED_PARTIAL";
  const failed = result.status !== "ANALYSED" && !partial;
  const badge = statusBadge(result);

  return (
    <li
      data-signal-symbol={result.symbol}
      className={cn(
        "border-b border-zinc-700/80 border-l-2 bg-zinc-950/10 transition-colors last:border-b-0",
        borderTone(status.tone),
        selected && "bg-zinc-800/45"
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(result.symbol)}
        aria-pressed={selected}
        aria-label={`Open signal detail for ${result.symbol}`}
        className="flex w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 hover:bg-zinc-800/30"
      >
        <span className="font-mono text-sm font-semibold tracking-wide text-zinc-100">
          {result.symbol}
        </span>
        <DirectionBadge direction={result.biasDirection} className="text-[11px]" />
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
            setupChipClass(result.setupScore)
          )}
          title="Setup score"
        >
          {formatScore(result.setupScore)}
        </span>
        <span className="ml-auto font-mono text-sm font-semibold tabular-nums text-zinc-100">
          {formatPrice(result.symbol, result.latestPrice)}
        </span>
        {failed ? (
          <span className="ml-2 flex min-w-[5rem] items-center justify-end gap-1 text-[11px] font-medium text-red-300">
            <span aria-hidden="true">{"\u26A0"}</span>
            <span>FAIL</span>
          </span>
        ) : (
          <span
            className={cn(
              "ml-2 flex min-w-[5rem] items-center justify-end gap-1 text-[11px] font-medium",
              badge.tone
            )}
          >
            <span aria-hidden="true">{badge.icon}</span>
            <span>{badge.label}</span>
          </span>
        )}
      </button>
      {failed && (
        <div className="px-3 pb-2 font-mono text-[10px] text-zinc-600">
          Engine status {result.status.replaceAll("_", " ")}
        </div>
      )}
    </li>
  );
}