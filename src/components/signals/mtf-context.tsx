/**
 * Multi-timeframe context summary.
 *
 * Shows the role each timeframe plays and the data depth/freshness behind it,
 * exactly as the scanner reports. No structure is recomputed here.
 */

import type { TimeframeSummary } from "@/scanner/scanner-result";
import { FreshnessBadge } from "@/components/common/badges";
import { TIMEFRAME_ROLE_LABEL } from "@/lib/signal-meta";
import { formatTimeShort, NOT_AVAILABLE } from "@/lib/format";

export function MtfContext({ timeframes }: { timeframes: TimeframeSummary[] }) {
  if (!timeframes || timeframes.length === 0) {
    return <p className="text-xs text-zinc-600">{NOT_AVAILABLE} No timeframe context.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {timeframes.map((tf) => (
        <div
          key={`${tf.role}-${tf.timeframe}`}
          className="rounded border border-zinc-800 bg-zinc-900/40 px-2.5 py-2"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-zinc-100">{tf.timeframe}</span>
            <FreshnessBadge status={tf.freshness} />
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-500">
            {TIMEFRAME_ROLE_LABEL[tf.role]}
          </div>
          <div className="mt-1 font-mono text-[11px] text-zinc-600">
            {tf.closedCandles} closed · {formatTimeShort(tf.asOf)}
          </div>
        </div>
      ))}
    </div>
  );
}
