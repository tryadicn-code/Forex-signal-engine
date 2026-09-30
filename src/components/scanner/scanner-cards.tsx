"use client";

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
import {
  workstationStatus,
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
    <ul>
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

function potentialPips(result: SymbolScanResult): number | null {
  const risk = result.riskDetail;
  if (
    !risk ||
    risk.entryPrice === null ||
    risk.entryPrice === undefined ||
    risk.takeProfit1 === null ||
    risk.takeProfit1 === undefined ||
    risk.pipSize === null ||
    risk.pipSize === undefined ||
    !Number.isFinite(risk.entryPrice) ||
    !Number.isFinite(risk.takeProfit1) ||
    !Number.isFinite(risk.pipSize) ||
    risk.pipSize <= 0
  ) {
    return null;
  }

  return Math.abs(risk.takeProfit1 - risk.entryPrice) / risk.pipSize;
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
  const failed = result.status !== "ANALYSED";
  const risk = result.riskDetail;
  const pips = potentialPips(result);
  const bias = result.bias ? BIAS_DISPLAY[result.bias] : "—";

  return (
    <li
      className={cn(
        "border-b border-zinc-700/70 border-l-2 bg-zinc-950/10 transition-colors last:border-b-0",
        status.tone === "ready"
          ? "border-l-emerald-500"
          : status.tone === "waiting"
            ? "border-l-amber-500"
            : status.tone === "blocked"
              ? "border-l-red-500"
              : "border-l-zinc-700",
        selected && "bg-zinc-800/45"
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(result.symbol)}
        aria-pressed={selected}
        aria-label={`Open signal detail for ${result.symbol}`}
        className="w-full px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
      >
        <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
          <span className="font-mono text-base font-semibold tracking-wide text-zinc-100">
            {result.symbol}
          </span>
          <DirectionBadge direction={result.biasDirection} className="text-[9px]" />
          <FreshnessBadge status={result.freshness} className="text-[9px]" />
          <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-600">
            {formatTimeShort(result.updatedAt)}
          </span>
          <span
            className="min-w-6 text-center font-mono text-xs font-semibold tabular-nums text-zinc-300"
            title="Setup score"
          >
            {formatScore(result.setupScore)}
          </span>
          <span className="min-w-[5.3rem] text-right font-mono text-base font-semibold tabular-nums text-zinc-100">
            {formatPrice(result.symbol, result.latestPrice)}
          </span>
        </div>

        {failed ? (
          <>
            <div className="mt-2 truncate text-[11px] text-red-300">
              Data issue · {result.reason}
            </div>
            <div className="mt-1 font-mono text-[10px] text-zinc-600">
              Engine status {result.status.replaceAll("_", " ")}
            </div>
          </>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-[1fr_1.25fr_auto] items-center gap-2 border-t border-zinc-800/70 pt-2 text-[10px] sm:text-[11px]">
              <span className="min-w-0 truncate text-zinc-500">
                Entry{" "}
                <span className="font-mono tabular-nums text-zinc-300">
                  {formatPrice(result.symbol, risk?.entryPrice ?? null)}
                </span>
              </span>
              <span className="min-w-0 truncate text-zinc-500">
                Potential{" "}
                <span className="font-mono tabular-nums text-emerald-300">
                  {pips === null ? "—" : formatPips(pips, true) + " pips"}
                </span>
              </span>
              <span className="whitespace-nowrap text-zinc-500">
                R:R{" "}
                <span className="font-mono tabular-nums text-zinc-300">
                  {formatRatio(result.riskReward)}
                </span>
              </span>
            </div>

            <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-[10px] leading-5">
              <span className="truncate font-medium text-zinc-400">{bias}</span>
              <span className="whitespace-nowrap text-zinc-600">
                Engine{" "}
                <span className="font-mono text-zinc-400">
                  {result.executionDecision ?? "—"}
                </span>
              </span>
              <span className="whitespace-nowrap text-zinc-600">
                Lifecycle{" "}
                <span className="font-mono text-zinc-400">
                  {result.signalState ?? "—"}
                </span>
              </span>
            </div>
          </>
        )}
      </button>
    </li>
  );
}
