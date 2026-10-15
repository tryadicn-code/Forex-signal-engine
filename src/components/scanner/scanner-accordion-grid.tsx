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
  type WorkstationStage,
  type WorkstationTone,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

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

function badgeLabel(tone: WorkstationTone): string {
  switch (tone) {
    case "ready":
      return "READY";
    case "waiting":
      return "WAIT";
    case "blocked":
      return "BLOCKED";
    case "invalid":
      return "INVALID";
    default:
      return "SCAN";
  }
}

function badgeClass(tone: WorkstationTone): string {
  switch (tone) {
    case "ready":
      return "border-emerald-700/70 bg-emerald-950/30 text-emerald-300";
    case "waiting":
      return "border-amber-700/70 bg-amber-950/30 text-amber-300";
    case "blocked":
      return "border-red-800/70 bg-red-950/30 text-red-300";
    default:
      return "border-zinc-700 bg-zinc-900/50 text-zinc-400";
  }
}

function borderTone(tone: WorkstationTone): string {
  if (tone === "ready") return "border-l-emerald-500";
  if (tone === "waiting") return "border-l-amber-500";
  if (tone === "blocked") return "border-l-red-500";
  return "border-l-zinc-700";
}

function stageBarClass(state: WorkstationStage["state"]): string {
  if (state === "done") return "bg-emerald-500";
  if (state === "current") return "bg-amber-400";
  if (state === "blocked") return "bg-red-500";
  return "bg-zinc-800";
}

function stageTextClass(state: WorkstationStage["state"]): string {
  if (state === "done") return "text-emerald-400";
  if (state === "current") return "text-amber-300";
  if (state === "blocked") return "text-red-400";
  return "text-zinc-600";
}

function stageStateLabel(state: WorkstationStage["state"]): string {
  if (state === "done") return "PASSED";
  if (state === "current") return "CURRENT";
  if (state === "blocked") return "BLOCKED";
  return "PENDING";
}

function setupChipClass(score: number | null): string {
  if (score === null || !Number.isFinite(score) || score <= 0) {
    return "border-zinc-700 bg-zinc-900/50 text-zinc-500";
  }
  if (score >= 80) {
    return "border-emerald-700/70 bg-emerald-950/25 text-emerald-300";
  }
  if (score >= 60) {
    return "border-amber-700/70 bg-amber-950/25 text-amber-300";
  }
  return "border-rose-800/70 bg-rose-950/25 text-rose-300";
}

function entryTone(result: SymbolScanResult): string {
  if (result.biasDirection === "LONG") return "text-emerald-300";
  if (result.biasDirection === "SHORT") return "text-rose-300";
  return "text-zinc-400";
}

function scoreDisplay(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return formatScore(score);
  }
  return `${formatScore(score)}/100`;
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
    <ul className="flex flex-col gap-1.5 p-2">
      {results.map((result) => (
        <AccordionRow
          key={result.symbol}
          result={result}
          expanded={expanded === result.symbol}
          selected={result.symbol === selectedSymbol}
          onToggle={() => toggle(result.symbol)}
          onOpen={() => onSelect(result.symbol)}
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
}: {
  result: SymbolScanResult;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const status = workstationStatus(result);
  const stages = workstationStages(result);
  const dir = directionArrow(result);
  const badge = badgeLabel(status.tone);
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
        "overflow-hidden rounded-md border border-zinc-800/60 border-l-2 bg-zinc-950/40 transition-colors",
        borderTone(status.tone),
        selected && "border-zinc-700/60 bg-zinc-800/45",
        expanded && "bg-zinc-900/60"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-1.5 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 hover:bg-zinc-800/25"
      >
        {/* Row 1: symbol · arrow · badge */}
        <div className="flex items-center gap-2">
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
              "ml-auto rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider",
              badgeClass(status.tone)
            )}
          >
            {badge}
          </span>
        </div>

        {/* Row 2: entry price · score */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "font-mono text-[12px] tabular-nums",
              entryTone(result)
            )}
          >
            {entryVal !== null ? (
              <>
                {"e "}
                {formatPrice(result.symbol, entryVal)}
              </>
            ) : (
              <span className="text-zinc-600">{"e \u2014"}</span>
            )}
          </span>
          <span
            className={cn(
              "rounded border px-1.5 py-0 font-mono text-[10px] font-semibold tabular-nums",
              setupChipClass(result.setupScore)
            )}
          >
            {scoreDisplay(result.setupScore)}
          </span>
        </div>

        {/* Row 3: stage bar */}
        <div
          className="flex gap-0.5"
          role="img"
          aria-label={stages.map((s) => `${s.label}: ${s.state}`).join(", ")}
        >
          {stages.map((stage) => (
            <span
              key={stage.label}
              title={`${stage.label}: ${stage.state}`}
              className={cn("h-1 flex-1 rounded-sm", stageBarClass(stage.state))}
            />
          ))}
        </div>

        {/* Row 4: reason · chevron */}
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">
            {status.detail}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "inline-block font-mono text-[12px] leading-none text-zinc-500 transition-transform duration-200 motion-reduce:transition-none",
              expanded && "rotate-90"
            )}
          >
            {"\u25B8"}
          </span>
        </div>
      </button>

      {/* Expanded panel — animated grid-rows 0fr → 1fr */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-zinc-800/60 px-3 py-2.5 text-[11px]">
            {/* Section: Mengapa */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Mengapa {badge.toLowerCase()}?
              </div>
              <div className="mt-0.5 text-zinc-200">{status.headline}</div>
              <div className="mt-0.5 leading-snug text-zinc-400">
                {status.detail}
              </div>
            </section>

            {/* Section: Ringkasan validasi */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Ringkasan validasi
              </div>
              <ul className="mt-1 space-y-0.5">
                {stages.map((stage) => (
                  <li
                    key={stage.label}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "font-mono text-[10px]",
                          stageTextClass(stage.state)
                        )}
                      >
                        {stageGlyph(stage)}
                      </span>
                      <span className="text-zinc-300">{stage.label}</span>
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-wider",
                        stageTextClass(stage.state)
                      )}
                    >
                      {stageStateLabel(stage.state)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Section: Levels */}
            <section>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Levels
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
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
            </section>

            {/* Section: Action */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              {result.signalState && (
                <span className="font-mono text-[10px] text-zinc-500">
                  {result.signalState}
                </span>
              )}
              <button
                type="button"
                aria-label={`Open signal detail for ${result.symbol}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen();
                }}
                className="ml-auto rounded border border-emerald-800/60 bg-emerald-950/20 px-2.5 py-1 text-[10px] font-medium text-emerald-200 hover:border-emerald-700 hover:bg-emerald-950/40"
              >
                Open Analysis {"\u203A"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
