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

function engineTone(decision: string | null): string {
  if (decision === "EXECUTE") return "text-emerald-300";
  if (decision === "WAIT") return "text-amber-300";
  if (decision === "BLOCKED") return "text-red-300";
  if (decision === "INVALIDATED") return "text-zinc-500";
  return "text-zinc-400";
}

function biasTone(bias: string | null): string {
  if (bias === "STRONG_LONG") return "text-emerald-300";
  if (bias === "STRONG_SHORT") return "text-red-300";
  return "text-zinc-400";
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
  const planned = result.plannedLevels ?? null;
  const isPlanned = !risk && planned !== null;
  const entryVal = risk?.entryPrice ?? planned?.entry ?? null;
  const tpVal = risk?.takeProfit1 ?? planned?.takeProfit ?? null;
  const slVal = risk?.stopLoss ?? planned?.stop ?? null;
  const rrVal = result.riskReward ?? risk?.plannedRR ?? planned?.rr ?? null;
  const pips = potentialPips(result);
  const bias = result.bias ? BIAS_DISPLAY[result.bias] : "\u2014";
  const marketClosed =
    result.updatedAt !== null && isMarketClosed(result.updatedAt);
  return (
    <li
      data-signal-symbol={result.symbol}
      className={cn(
        "border-b border-zinc-700/80 border-l-2 bg-zinc-950/10 transition-colors last:border-b-0",
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
          <DirectionBadge direction={result.biasDirection} className="text-[11px]" />
          <FreshnessBadge status={result.freshness} className="text-[11px]" marketClosed={marketClosed} />
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
              setupChipClass(result.setupScore)
            )}
            title="Setup score"
          >
            {formatScore(result.setupScore)}
          </span>
          <span className="ml-auto min-w-[5.3rem] text-right font-mono text-base font-semibold tabular-nums text-zinc-100">
            {formatPrice(result.symbol, result.latestPrice)}
          </span>
        </div>

        {failed ? (
          <>
            <div className="mt-2 truncate border-t border-zinc-800/70 pt-2 text-[11px] text-red-300">
              Data issue · {result.reason}
            </div>
            <div className="mt-1 font-mono text-[11px] text-zinc-600">
              Engine status {result.status.replaceAll("_", " ")}
            </div>
          </>
        ) : (
          <>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-zinc-800/70 pt-2 text-[11px] sm:grid-cols-4">
              <span className="min-w-0 whitespace-nowrap text-left text-zinc-500">
                Entry{" "}
                <span className="font-mono tabular-nums text-zinc-300">
                  {formatPrice(result.symbol, entryVal)}
                </span>
              </span>

              <span className="min-w-0 whitespace-nowrap text-right text-zinc-500 sm:text-center">
                TP{" "}
                <span className="font-mono tabular-nums text-emerald-300">
                  {formatPrice(result.symbol, tpVal)}
                </span>
                {pips !== null && (
                  <span className="font-mono tabular-nums text-emerald-300">
                    {" "}({formatPips(pips, true)})
                  </span>
                )}
              </span>

              <span className="min-w-0 whitespace-nowrap text-left text-zinc-500 sm:text-center">
                SL{" "}
                <span className="font-mono tabular-nums text-red-300">
                  {formatPrice(result.symbol, slVal)}
                </span>
              </span>

              <span className="min-w-0 whitespace-nowrap text-right text-zinc-500">
                R:R{" "}
                <span className="font-mono tabular-nums text-zinc-300">
                  {formatRatio(rrVal)}
                </span>
              </span>
            </div>
            {isPlanned && (
                <div className="mt-1 text-[11px] text-zinc-600">
                  Planned levels {"\u2014"} trigger pending
                </div>
              )}

            <div className="mt-1.5 flex items-center gap-2 text-[11px] leading-5">
              <span className={cn("truncate font-medium", biasTone(result.bias))}>
                {bias}
              </span>

              <div className="ml-auto flex items-center justify-end gap-2">
                <span className="whitespace-nowrap text-right text-zinc-600">
                  Engine{" "}
                  <span className={cn("font-mono", engineTone(result.executionDecision))}>
                    {result.executionDecision ?? "—"}
                  </span>
                </span>

                <span className="whitespace-nowrap text-right text-zinc-600">
                  Lifecycle{" "}
                  <span className="font-mono text-zinc-400">
                    {result.signalState ?? "—"}
                  </span>
                </span>

                <span className="whitespace-nowrap text-right font-mono tabular-nums text-zinc-600">
                  {formatTimeShort(result.updatedAt)}
                </span>
              </div>
            </div>
          </>
        )}
      </button>
    </li>
  );
}
