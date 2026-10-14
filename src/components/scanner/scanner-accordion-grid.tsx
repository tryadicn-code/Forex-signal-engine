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
    <ul className="divide-y divide-zinc-800/60">
      {results.map((result) => (
        <AccordionRow
          key={result.symbol}
          result={result}
          expanded={expanded === result.symbol}
          selected={result.symbol === selectedSymbol}
          onToggle={() => toggle(result.symbol)}
          onOpen={() => onSelect(result.symbol)}
          onClose={() => setExpanded(null)}
        />
      ))}
    </ul>
  );
}

function AccordionRow({
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
    <li
      data-signal-symbol={result.symbol}
      className={cn(
        "border-l-2 bg-zinc-950/10 transition-colors",
        borderTone(status.tone),
        selected && "bg-zinc-800/45",
        expanded && "bg-zinc-900/55"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`Toggle details for ${result.symbol}`}
        className="flex w-full items-center gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 hover:bg-zinc-800/25"
      >
        {/* Symbol */}
        <span className="font-mono text-sm font-semibold tracking-wide text-zinc-100">
          {result.symbol}
        </span>

        {/* Direction arrow */}
        <span
          aria-label={result.biasDirection ?? "NEUTRAL"}
          className={cn("font-mono text-[11px] leading-none", dir.tone)}
        >
          {dir.glyph}
        </span>

        {/* Entry price */}
        <span className={cn("font-mono text-[12px] tabular-nums", entryTone(result))}>
          {entryVal !== null ? (
            <>
              {"e "}
              {formatPrice(result.symbol, entryVal)}
            </>
          ) : (
            <span className="text-zinc-600">{"e \u2014"}</span>
          )}
        </span>

        {/* Pipeline glyph */}
        <span className="ml-auto flex items-center gap-0.5 font-mono text-[11px] leading-none">
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

        {/* Status text */}
        <span className={cn("text-[10px] font-medium", st.tone)}>
          {st.label}
        </span>

        {/* Score chip */}
        <span
          className={cn(
            "rounded border px-1 py-0 font-mono text-[10px] font-semibold tabular-nums",
            setupChipClass(result.setupScore)
          )}
        >
          {formatScore(result.setupScore)}
        </span>
      </button>

      {failed && (
        <div className="px-3 pb-2 font-mono text-[10px] text-zinc-600">
          Engine status {result.status.replaceAll("_", " ")}
        </div>
      )}

      {expanded && !failed && (
        <div className="border-t border-zinc-800/60 px-3 py-2.5 transition-all duration-200">
          <div className="flex items-start justify-between gap-2">
            <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
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
                <span className="text-zinc-500">Time</span>
                <span className="font-mono tabular-nums text-zinc-500">
                  {formatTimeShort(result.updatedAt)}
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close details"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="rounded border border-zinc-700 px-1.5 py-0 font-mono text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            >
              {"\u00D7"}
            </button>
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
              className="rounded border border-emerald-800/60 bg-emerald-950/20 px-2.5 py-1 text-[10px] font-medium text-emerald-200 hover:border-emerald-700 hover:bg-emerald-950/40"
            >
              Open Analysis {"\u203A"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}