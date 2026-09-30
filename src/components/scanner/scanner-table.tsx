"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import {
  DirectionBadge,
  FreshnessBadge,
} from "@/components/common/badges";
import {
  formatPrice,
  formatRatio,
  formatScore,
  formatTimeShort,
} from "@/lib/format";
import {
  workstationStatus,
  workstationToneClass,
} from "@/lib/workstation-status";
import { cn } from "@/lib/utils";

export function ScannerTable({
  results,
  selectedSymbol,
  onSelect,
}: {
  results: SymbolScanResult[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Scanner results. Activate a row to open signal detail.
        </caption>
        <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
          <tr className="text-[11px] font-medium text-zinc-500">
            <th scope="col" className="px-3 py-2 font-medium">Pair</th>
            <th scope="col" className="px-2 py-2 font-medium">Direction</th>
            <th scope="col" className="px-2 py-2 font-medium">Setup</th>
            <th scope="col" className="px-2 py-2 font-medium">Trigger</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">R:R</th>
            <th scope="col" className="px-2 py-2 font-medium">Decision</th>
            <th scope="col" className="px-2 py-2 font-medium">Freshness</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {results.map((result) => {
            const selected = result.symbol === selectedSymbol;
            const status = workstationStatus(result);
            const failed = result.status !== "ANALYSED";

            return (
              <tr
                key={result.symbol}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(result.symbol)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(result.symbol);
                  }
                }}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-zinc-800/45 focus-visible:bg-zinc-800/60 focus-visible:outline-none",
                  selected && "bg-zinc-800/55"
                )}
              >
                <td className="px-3 py-2.5">
                  <div className="font-mono text-sm font-semibold text-zinc-100">
                    {result.symbol}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-zinc-600">
                    {formatPrice(result.symbol, result.latestPrice)}
                  </div>
                </td>

                {failed ? (
                  <td colSpan={6} className="px-2 py-2.5">
                    <div className="text-xs font-semibold text-red-300">Data issue</div>
                    <div className="mt-0.5 max-w-2xl truncate text-[11px] text-zinc-500">
                      {result.reason}
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-2 py-2.5">
                      <DirectionBadge direction={result.biasDirection} />
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="text-xs text-zinc-300">{result.setupState ?? "—"}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-zinc-600">
                        score {formatScore(result.setupScore)}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-zinc-300">
                      {result.triggerState ?? "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-xs tabular-nums text-zinc-200">
                      {formatRatio(result.riskReward)}
                    </td>
                    <td className="min-w-44 px-2 py-2.5">
                      <div className={cn("text-xs font-semibold", workstationToneClass(status.tone))}>
                        {status.headline}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
                        {result.executionDecision ?? "—"} · {result.signalState ?? "—"}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <FreshnessBadge status={result.freshness} />
                    </td>
                  </>
                )}

                <td className="px-3 py-2.5 text-right font-mono text-[11px] tabular-nums text-zinc-500">
                  {formatTimeShort(result.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
