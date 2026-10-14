"use client";

import { useState } from "react";
import type { SymbolScanResult } from "@/scanner/scanner-result";
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
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

function isFailed(result: SymbolScanResult): boolean {
  return result.status !== "ANALYSED" && result.status !== "ANALYSED_PARTIAL";
}

function directionArrow(result: SymbolScanResult): {
  glyph: string;
  tone: string;
} {
  if (result.biasDirection === "LONG") {
    return { glyph: "\u25B2", tone: "text-emerald-300" };
  }
  if (result.biasDirection === "SHORT") {
    return { glyph: "\u25BC", tone: "text-rose-300" };
  }
  return { glyph: "\u00B7", tone: "text-zinc-500" };
}

function statusLabel(result: SymbolScanResult): {
  label: string;
  tone: string;
} {
  if (isFailed(result)) return { label: "FAIL", tone: "text-zinc-500" };
  if (result.executionDecision === "EXECUTE") {
    return { label: "EXEC", tone: "text-emerald-300" };
  }
  if (result.executionDecision === "BLOCKED") {
    return { label: "BLOCK", tone: "text-red-300" };
  }
  if (result.executionDecision === "INVALIDATED") {
    return { label: "FAIL", tone: "text-zinc-500" };
  }
  if (result.signalState === "ARMED") {
    return { label: "ARMED", tone: "text-amber-300" };
  }
  if (result.executionDecision === "WAIT" || result.signalState === "WATCH") {
    return { label: "WAIT", tone: "text-amber-300" };
  }
  return { label: "NONE", tone: "text-zinc-500" };
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

function entryTone(result: SymbolScanResult): string {
  if (result.biasDirection === "LONG") return "text-emerald-300";
  if (result.biasDirection === "SHORT") return "text-rose-300";
  return "text-zinc-400";
}

export function ScannerAccordionGrid({
  results,
  selectedSymbol,
  onSelect,
}: {
  results: SymbolScanResult[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (symbol: string) =>
    setExpanded((prev) => (prev === symbol ? null : symbol));

  return (
    <div className="grid grid-cols-2 gap-1.5 p-1.5 lg:grid-cols-4">
      {results.map((result) => (
        <AccordionCard
          key={result.symbol}
          result={result}
          expanded={expanded === result.symbol}
          selected={result.symbol === selectedSymbol}
          onToggle={() => toggle(result.symbol)}
          onOpen={() => onSelect(result.symbol)}
          onClose={() => setExpanded(null)}
        />
      ))}
    </div>
  );
}

function AccordionCard({
  result,
  expanded,
  selected,
  onToggle,
  onOpen,
  onClose,
}: {
  result: SymbolScanResult;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onClose: () => void;
}) {
  const status = workstationStatus(result);
  const stages = workstationStages(result);
  const failed = isFailed(result);
  const dir = directionArrow(result);
  const st = statusLabel(result);
  const risk = result.riskDetail;
  const planned = result.plannedLevels ?? null;
  const entryVal = risk?.entryPrice ?? planned?.entry ?? null;
  const tpVal = risk?.takeProfit1 ?? planned?.takeProfit ?? null;
  const slVal = risk?.stopLoss ?? planned?.stop ?? null;
  const rrVal = result.riskReward ?? risk?.plannedRR ?? planned?.rr ?? null;

  return (
    <article
      data-signal-symbol={result.symbol}
      className={cn(
        "rounded border border-zinc-800 border-l-2 bg-zinc-950/20 transition-colors",
        borderTone(status.tone),
        selected && "ring-1 ring-emerald-700/50",
        expanded && "col-span-2 bg-zinc-900/50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`Toggle details for ${result.symbol}`}
        className="w-full px-2 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-semibold tracking-wide text-zinc-100">
            {result.symbol}
          </span>
          <span
            aria-label={result.biasDirection ?? "NEUTRAL"}
            className={cn("font-mono text-[11px] leading-none", dir.tone)}
          >
            {dir.glyph}
          </span>
          <span
            className={cn(
              "ml-auto rounded border px-1 py-0 font-mono text-[10px] font-semibold tabular-nums",
              setupChipClass(result.setupScore)
            )}
          >
            {formatScore(result.setupScore)}
          </span>
          {expanded && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Close details"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                  event.preventDefault();
                  onClose();
                }
              }}
              className="ml-1 cursor-pointer rounded border border-zinc-700 px-1 font-mono text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            >
              {"\u00D7"}
            </span>
          )}
        </div>

        <div className="mt-0.5 flex items-baseline gap-1.5 font-mono text-[11px] tabular-nums">
          <span className="text-sm font-semibold text-zinc-100">
            {formatPrice(result.symbol, result.latestPrice)}
          </span>
          {entryVal !== null && (
            <span className={cn("text-[10px]", entryTone(result))}>
              {"e "}
              {formatPrice(result.symbol, entryVal)}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between gap-1">
          <span className="flex items-center gap-0.5 font-mono text-[11px] leading-none">
            {stages.map((stage) => (
              <span
                key={stage.label}
                aria-label={`${stage.label}: ${stage.state}`}
                className={cn("leading-none", stageToneClass(stage.state))}
              >
                {stageGlyph(stage)}
              </span>
            ))}
          </span>
          <span className={cn("text-[10px] font-medium", st.tone)}>
            {st.label}
          </span>
        </div>

        {failed && (
          <div className="mt-1 font-mono text-[10px] text-zinc-600">
            Engine status {result.status.replaceAll("_", " ")}
          </div>
        )}
      </button>

      {expanded && !failed && (
        <div className="border-t border-zinc-800 px-2 py-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-zinc-500">TP</span>
              <span className="font-mono tabular-nums text-emerald-300">
                {formatPrice(result.symbol, tpVal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">R:R</span>
              <span className="font-mono tabular-nums text-zinc-300">
                {formatRatio(rrVal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">SL</span>
              <span className="font-mono tabular-nums text-red-300">
                {formatPrice(result.symbol, slVal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">{"\u00B7"}</span>
              <span className="font-mono tabular-nums text-zinc-500">
                {formatTimeShort(result.updatedAt)}
              </span>
            </div>
          </div>

          {result.signalState && (
            <div className="mt-1.5 font-mono text-[10px] text-zinc-500">
              {result.signalState}
            </div>
          )}

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              aria-label={`Open signal detail for ${result.symbol}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              className="rounded border border-emerald-800/60 bg-emerald-950/20 px-2 py-1 text-[10px] font-medium text-emerald-200 hover:border-emerald-700 hover:bg-emerald-950/40"
            >
              Open Analysis {"\u203A"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}