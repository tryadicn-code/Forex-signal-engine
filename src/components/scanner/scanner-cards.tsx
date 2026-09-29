/**
 * Mobile scanner representation.
 *
 * Mobile hierarchy is intentionally different from the desktop table:
 * symbol/price first, direction/freshness second, state/decision third, then
 * compact metrics and a clear analysis action.
 */

"use client";

import type { SymbolScanResult } from "@/scanner/scanner-result";
import {
  Badge,
  DecisionBadge,
  DirectionBadge,
  FreshnessBadge,
  StateBadge,
} from "@/components/common/badges";
import { BIAS_DISPLAY } from "@/lib/signal-meta";
import {
  formatPrice,
  formatRatio,
  formatScore,
  formatTimeShort,
} from "@/lib/format";
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
  const actionable =
    result.executionDecision === "EXECUTE" &&
    result.signalState === "EXECUTE";
  const engineLifecycleMismatch =
    result.executionDecision === "EXECUTE" &&
    result.signalState !== "EXECUTE";

  return (
    <li
      className={cn(
        "border-l-2 px-3 py-2.5",
        actionable
          ? "border-l-emerald-500"
          : engineLifecycleMismatch
            ? "border-l-amber-500"
            : result.executionDecision === "BLOCKED" || result.signalState === "BLOCKED"
              ? "border-l-orange-500"
              : "border-l-zinc-800",
        selected && "bg-zinc-800/50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="font-mono text-[15px] font-semibold tracking-wide text-zinc-100">
          {result.symbol}
        </div>
        <div className="text-right">
          <div className="font-mono text-[15px] font-semibold tabular-nums text-zinc-100">
            {formatPrice(result.symbol, result.latestPrice)}
          </div>
          <div className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-600">
            {formatTimeShort(result.updatedAt)}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <DirectionBadge direction={result.biasDirection} className="text-[9px]" />
        <FreshnessBadge status={result.freshness} className="text-[8px]" />
        {result.signalState && (
          <StateBadge state={result.signalState} className="max-w-full text-[8px]" />
        )}
      </div>

      {failed ? (
        <div className="mt-3 rounded-md border border-orange-800/50 bg-orange-950/20 px-2.5 py-2">
          <div className="font-mono text-[11px] font-semibold text-orange-300">
            {result.status.replaceAll("_", " ")}
          </div>
          <p className="mt-1 break-words text-[11px] leading-relaxed text-orange-200/60">
            {result.reason}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-2 border-t border-zinc-800/70 pt-2">
            <dl className="grid grid-cols-3 gap-2">
              <CompactMetric
                label="Bias"
                value={result.bias ? BIAS_DISPLAY[result.bias] : "—"}
              />
              <CompactMetric label="Setup" value={formatScore(result.setupScore)} />
              <CompactMetric label="R:R" value={formatRatio(result.riskReward)} />
            </dl>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {result.executionDecision ? (
                <DecisionBadge
                  decision={result.executionDecision}
                  className="max-w-full text-[8px]"
                />
              ) : (
                <Badge tone="muted" className="text-[8px]">NO ENGINE DECISION</Badge>
              )}

              {actionable && (
                <Badge tone="bullish" glyph="●" className="text-[8px]">
                  PAPER ACTIONABLE
                </Badge>
              )}

              {engineLifecycleMismatch && (
                <>
                  <Badge tone="warning" glyph="!" className="text-[8px]">
                    NOT ACTIONABLE
                  </Badge>
                  <span className="text-[9px] text-amber-200/55">
                    Lifecycle {result.signalState ?? "unavailable"}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSelect(result.symbol)}
              aria-pressed={selected}
              aria-label={`Open signal detail for ${result.symbol}`}
              className="mt-2 w-full rounded-md border border-zinc-700 px-3 py-1.5 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              View analysis
            </button>
          </div>
        </>
      )}

      {failed && (
        <button
          type="button"
          onClick={() => onSelect(result.symbol)}
          aria-label={`Open signal detail for ${result.symbol}`}
          className="mt-2 rounded-md border border-zinc-700 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 hover:bg-zinc-800"
        >
          View details
        </button>
      )}
    </li>
  );
}

function CompactMetric({
  label,
  value,
  node,
}: {
  label: string;
  value?: string;
  node?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</dt>
      <dd className="mt-0.5 min-h-5 font-mono text-[11px] text-zinc-300">
        {node ?? value ?? "—"}
      </dd>
    </div>
  );
}
