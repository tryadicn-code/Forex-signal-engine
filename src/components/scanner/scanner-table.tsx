/**
 * Desktop scanner table.
 *
 * Renders engine output only. A row that failed to analyse renders its failure
 * status instead of fabricated engine values, and never stops other rows from
 * rendering. Selecting a row opens the signal detail panel.
 */

"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import {
  BiasBadge,
  DecisionBadge,
  FreshnessBadge,
  RegimeBadge,
  SetupStateBadge,
  StateBadge,
  TriggerStateBadge,
} from "@/components/common/badges";
import {
  formatPrice,
  formatRatio,
  formatScore,
  formatTimeShort,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_GLYPH: Record<SymbolScanResult["status"], string> = {
  ANALYSED: "✓",
  PROVIDER_FAILURE: "✕",
  INVALID_DATA: "✕",
  ANALYSIS_ERROR: "✕",
};

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
          Scanner results by symbol. Activate a row to open its signal detail.
        </caption>
        <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
          <tr className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            <th scope="col" className="px-2 py-1.5 pl-3 font-medium">Symbol</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Price</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Regime</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Bias</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Bias</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Setup</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Setup</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Trigger</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">R:R</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Decision</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Signal</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Data</th>
            <th scope="col" className="px-2 py-1.5 pr-3 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80">
          {results.map((result) => (
            <ScannerRow
              key={result.symbol}
              result={result}
              selected={result.symbol === selectedSymbol}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScannerRow({
  result,
  selected,
  onSelect,
}: {
  result: SymbolScanResult;
  selected: boolean;
  onSelect: (symbol: string) => void;
}) {
  const failed = result.status !== "ANALYSED";
  const attentionTone =
    result.executionDecision === "EXECUTE"
      ? "border-l-emerald-500"
      : result.executionDecision === "BLOCKED" || result.signalState === "BLOCKED"
        ? "border-l-orange-500"
        : "border-l-zinc-800";

  return (
    <tr
      tabIndex={0}
      role="row"
      aria-selected={selected}
      onClick={() => onSelect(result.symbol)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(result.symbol);
        }
      }}
      title={result.reason}
      className={cn(
        "group cursor-pointer border-l-2 outline-none transition-colors focus-visible:bg-zinc-800/60 hover:bg-zinc-800/40",
        attentionTone,
        selected && "bg-zinc-800/60 ring-1 ring-inset ring-zinc-600"
      )}
    >
      <th scope="row" className="px-2 py-1.5 pl-3 font-mono text-xs font-semibold text-zinc-100">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("text-[10px]", failed ? "text-orange-400" : "text-zinc-600")}
          >
            {STATUS_GLYPH[result.status]}
          </span>
          {result.symbol}
        </span>
      </th>
      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-zinc-200">
        {formatPrice(result.symbol, result.latestPrice)}
      </td>
      {failed ? (
        <>
          <td className="px-2 py-1.5" colSpan={9}>
            <span className="font-mono text-[11px] text-orange-300/90">
              {result.status.replace("_", " ")} — {result.reason}
            </span>
          </td>
          <td className="px-2 py-1.5">
            <FreshnessBadge status={result.freshness} />
          </td>
        </>
      ) : (
        <>
          <td className="px-2 py-1.5"><RegimeBadge regime={result.regime} /></td>
          <td className="px-2 py-1.5"><BiasBadge bias={result.bias} /></td>
          <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-zinc-300">
            {formatScore(result.biasScore)}
          </td>
          <td className="px-2 py-1.5"><SetupStateBadge state={result.setupState} /></td>
          <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-zinc-300">
            {formatScore(result.setupScore)}
          </td>
          <td className="px-2 py-1.5"><TriggerStateBadge state={result.triggerState} /></td>
          <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-zinc-300">
            {formatRatio(result.riskReward)}
          </td>
          <td className="px-2 py-1.5"><DecisionBadge decision={result.executionDecision} /></td>
          <td className="px-2 py-1.5"><StateBadge state={result.signalState} /></td>
          <td className="px-2 py-1.5"><FreshnessBadge status={result.freshness} /></td>
        </>
      )}
      <td className="px-2 py-1.5 pr-3 text-right font-mono text-[11px] tabular-nums text-zinc-500">
        {formatTimeShort(result.updatedAt)}
      </td>
    </tr>
  );
}
