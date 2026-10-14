"use client";

import { useState } from "react";
import type { SymbolScanResult } from "@/scanner/scanner-result";
import {
  DirectionBadge,
  FreshnessBadge,
} from "@/components/common/badges";
import { BIAS_DISPLAY } from "@/lib/signal-meta";
import {
  formatPips,
  formatPrice,
  formatRatio,
  formatScore,
  formatTimeShort,
} from "@/lib/format";
import { workstationStatus } from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

/** UIUX-M-008: FX sessions run Sun 22:00 UTC .. Fri 21:00 UTC. */
function isMarketClosed(ts: number): boolean {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const hour = d.getUTCHours();
  if (day === 6) return true;
  if (day === 0 && hour < 22) return true;
  if (day === 5 && hour >= 21) return true;
  return false;
}

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

function statusIcon(result: SymbolScanResult): { icon: string; label: string; tone: string } {
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [neutralCollapsed, setNeutralCollapsed] = useState(true);

  const activeResults = results.filter((r) => !isNeutralWithoutLevels(r));
  const neutralResults = results.filter((r) => isNeutralWithoutLevels(r));

  const toggle = (symbol: string) =>
    setExpanded((prev) => (prev === symbol ? null : symbol));

  return (
    <>
      {activeResults.length > 0 && (
        <ul>
          {activeResults.map((result) => (
            <CompactRow
              key={result.symbol}
              result={result}
              expanded={expanded === result.symbol}
              selected={result.symbol === selectedSymbol}
              onToggle={() => toggle(result.symbol)}
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
            className="flex w-full items-center gap-2 border-b border-zinc-700/80 bg-zinc-950/40 px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500 transition-colors hover:bg-zinc-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
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
                  expanded={expanded === result.symbol}
                  selected={result.symbol === selectedSymbol}
                  onToggle={() => toggle(result.symbol)}
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
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  result: SymbolScanResult;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: (symbol: string) => void;
}) {
  const status = workstationStatus(result);
  const partial = result.status === "ANALYSED_PARTIAL";
  const failed = result.status !== "ANALYSED" && !partial;
  const risk = result.riskDetail;
  const planned = result.plannedLevels ?? null;
  const entryVal = risk?.entryPrice ?? planned?.entry ?? null;
  const tpVal = risk?.takeProfit1 ?? planned?.takeProfit ?? null;
  const slVal = risk?.stopLoss ?? planned?.stop ?? null;
  const rrVal = result.riskReward ?? risk?.plannedRR ?? planned?.rr ?? null;
  const bias = result.bias ? BIAS_DISPLAY[result.bias] : "\u2014";
  const marketClosed =
    result.updatedAt !== null && isMarketClosed(result.updatedAt);
  const badge = statusIcon(result);

  const pips =
    risk &&
    entryVal !== null &&
    tpVal !== null &&
    risk.pipSize &&
    risk.pipSize > 0
      ? Math.abs(tpVal - entryVal) / risk.pipSize
      : null;

  return (
    <li
      data-signal-symbol={result.symbol}
      className={cn(
        "border-b border-zinc-700/80 border-l-2 bg-zinc-950/10 transition-colors last:border-b-0",
        borderTone(status.tone),
        selected && "bg-zinc-800/45",
        expanded && "bg-zinc-900/60"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
      >
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
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
          <span className={cn("flex min-w-[5rem] items-center justify-end gap-1 text-[11px] font-medium", badge.tone)}>
            <span aria-hidden="true">{badge.icon}</span>
            <span>{badge.label}</span>
          </span>
          <span aria-hidden="true" className="font-mono text-zinc-600">
            {expanded ? "\u2304" : "\u203A"}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          {failed ? (
            <div className="rounded border border-red-900/60 bg-red-950/20 px-2.5 py-2 text-[11px] text-red-200">
              <div className="font-semibold">Data issue</div>
              <div className="mt-0.5 text-red-200/80">{result.reason}</div>
              <div className="mt-1 font-mono text-zinc-500">
                Engine status {result.status.replaceAll("_", " ")}
              </div>
            </div>
          ) : (
            <div className="grid gap-2 rounded border border-zinc-800 bg-zinc-950/30 px-3 py-2 text-[11px] sm:grid-cols-3">
              <div className="flex justify-between sm:block">
                <span className="text-zinc-500">Entry</span>
                <div className="font-mono tabular-nums text-zinc-200">
                  {formatPrice(result.symbol, entryVal)}
                </div>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-zinc-500">TP</span>
                <div className="font-mono tabular-nums text-emerald-300">
                  {formatPrice(result.symbol, tpVal)}
                  {pips !== null && (
                    <span className="ml-1 text-emerald-400/80">
                      ({formatPips(pips, true)})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between sm:block">
                <span className="text-zinc-500">SL</span>
                <div className="font-mono tabular-nums text-red-300">
                  {formatPrice(result.symbol, slVal)}
                </div>
              </div>
            </div>
          )}

          {!failed && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
              <span>
                R:R{" "}
                <span className="font-mono tabular-nums text-zinc-300">
                  {formatRatio(rrVal)}
                </span>
              </span>
              <span className={cn("font-medium", "text-zinc-400")}>{bias}</span>
              <FreshnessBadge
                status={result.freshness}
                className="text-[11px]"
                marketClosed={marketClosed}
              />
              {partial && (
                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-300">
                  PARTIAL
                </span>
              )}
              <span className="ml-auto font-mono tabular-nums text-zinc-600">
                {formatTimeShort(result.updatedAt)}
              </span>
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(result.symbol);
              }}
              className="rounded border border-emerald-800/60 bg-emerald-950/20 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:border-emerald-700 hover:bg-emerald-950/40"
            >
              Open Analysis {"\u203A"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}