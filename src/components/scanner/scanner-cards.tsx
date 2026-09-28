/**
 * Mobile scanner representation.
 *
 * Deliberately not the desktop table at a smaller size: mobile gets a compact
 * card per symbol carrying the fields that matter on a small screen, with a
 * native disclosure for the deeper readout and a button to open the full
 * signal detail.
 */

"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import {
  BiasBadge,
  DecisionBadge,
  DirectionBadge,
  FreshnessBadge,
  StateBadge,
} from "@/components/common/badges";
import { formatPrice, formatRatio, formatScore, formatTimeShort } from "@/lib/format";
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
    <ul className="divide-y divide-zinc-800/80">
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

function ScannerCard({
  result,
  selected,
  onSelect,
}: {
  result: SymbolScanResult;
  selected: boolean;
  onSelect: (symbol: string) => void;
}) {
  const failed = result.status !== "ANALYSED";

  return (
    <li
      className={cn(
        "border-l-2 px-3 py-2",
        result.executionDecision === "EXECUTE"
          ? "border-l-emerald-500"
          : result.executionDecision === "BLOCKED" || result.signalState === "BLOCKED"
            ? "border-l-orange-500"
            : "border-l-zinc-800",
        selected && "bg-zinc-800/60"
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(result.symbol)}
          className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left outline-none focus-visible:text-emerald-300"
          aria-pressed={selected}
          aria-label={`Open signal detail for ${result.symbol}`}
        >
          <span className="font-mono text-sm font-semibold text-zinc-100">
            {result.symbol}
          </span>
          <DirectionBadge direction={result.biasDirection} />
          <span className="ml-auto font-mono text-sm tabular-nums text-zinc-200">
            {formatPrice(result.symbol, result.latestPrice)}
          </span>
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {failed ? (
          <span className="font-mono text-[11px] text-orange-300/90">
            {result.status.replace("_", " ")}
          </span>
        ) : (
          <>
            <BiasBadge bias={result.bias} />
            <StateBadge state={result.signalState} />
            <DecisionBadge decision={result.executionDecision} />
          </>
        )}
        <FreshnessBadge status={result.freshness} />
        <span className="ml-auto font-mono text-[11px] tabular-nums text-zinc-500">
          {formatTimeShort(result.updatedAt)}
        </span>
      </div>

      {!failed && (
        <details className="group mt-1">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ›
            </span>
            More
          </summary>
          <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-[11px]">
            <div>
              <dt className="text-zinc-600">Setup</dt>
              <dd className="text-zinc-300">{formatScore(result.setupScore)}</dd>
            </div>
            <div>
              <dt className="text-zinc-600">R:R</dt>
              <dd className="text-zinc-300">{formatRatio(result.riskReward)}</dd>
            </div>
            <div>
              <dt className="text-zinc-600">Spread</dt>
              <dd className="text-zinc-300">
                {result.spreadPips === null ? "—" : result.spreadPips.toFixed(1) + " p"}
              </dd>
            </div>
          </dl>
        </details>
      )}

      {failed && (
        <p className="mt-1 break-words font-mono text-[11px] text-orange-300/80">
          {result.reason}
        </p>
      )}
    </li>
  );
}
