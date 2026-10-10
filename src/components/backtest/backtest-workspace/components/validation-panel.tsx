import type { HistoricalDatasetValidation } from "@/replay/import-types";
import { formatOffset, formatUtc } from "../lib/formatters";

export function ValidationPanel({
  validation,
}: {
  validation: HistoricalDatasetValidation;
}) {
  const errors = validation.issues.filter((issue) => issue.severity === "ERROR");
  const warnings = validation.issues.filter(
    (issue) => issue.severity === "WARNING"
  );

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Dataset validation</h2>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            {validation.importedFileCount} files · {validation.importedSymbolCount} symbols · {validation.importedSeriesCount} series
          </p>
        </div>
        <span
          className={
            "rounded border px-2 py-1 font-mono text-[11px] font-semibold " +
            (validation.valid
              ? "border-emerald-800 bg-emerald-950/30 text-emerald-300"
              : "border-red-800 bg-red-950/30 text-red-300")
          }
        >
          {validation.valid ? "VALID" : "BLOCKED"}
        </span>
      </header>

      <div className="grid gap-3 p-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <dl className="grid grid-cols-2 gap-2 text-[11px]">
          <DataItem label="UTC offset" value={formatOffset(validation.sourceUtcOffsetMinutes)} />
          <DataItem label="Spread" value={validation.assumedSpreadPips + " pips"} />
          <DataItem label="Common start" value={formatUtc(validation.commonStartAt)} />
          <DataItem label="Common end" value={formatUtc(validation.commonEndAt)} />
          <DataItem
            label="Est. M15 steps"
            value={
              validation.estimatedM15Steps === null
                ? "—"
                : validation.estimatedM15Steps.toLocaleString()
            }
          />
          <DataItem
            label="Issues"
            value={errors.length + " errors · " + warnings.length + " warnings"}
          />
        </dl>

        <div className="min-w-0">
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full min-w-[620px] text-left text-[11px]">
              <thead className="bg-zinc-950/70 text-zinc-600">
                <tr>
                  <th className="px-2 py-1.5">Series</th>
                  <th className="px-2 py-1.5">Candles</th>
                  <th className="px-2 py-1.5">Start</th>
                  <th className="px-2 py-1.5">End</th>
                  <th className="px-2 py-1.5">Gaps</th>
                </tr>
              </thead>
              <tbody>
                {validation.series.map((row) => (
                  <tr
                    key={row.symbol + row.timeframe}
                    className="border-t border-zinc-800 text-zinc-400"
                  >
                    <td className="px-2 py-1.5 font-mono text-zinc-200">
                      {row.symbol} · {row.timeframe}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{row.candleCount.toLocaleString()}</td>
                    <td className="px-2 py-1.5 font-mono">{formatUtc(row.startAt)}</td>
                    <td className="px-2 py-1.5 font-mono">{formatUtc(row.endAt)}</td>
                    <td className="px-2 py-1.5 font-mono">{row.nonWeekendGapCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validation.issues.length > 0 && (
            <details className="mt-2 rounded border border-zinc-800 bg-zinc-950/30">
              <summary className="cursor-pointer px-2.5 py-2 text-[11px] font-medium text-zinc-400">
                Validation issues ({validation.issues.length})
              </summary>
              <div className="max-h-48 space-y-1 overflow-auto border-t border-zinc-800 p-2">
                {validation.issues.map((issue, index) => (
                  <div
                    key={issue.code + index}
                    className={
                      "text-[11px] leading-relaxed " +
                      (issue.severity === "ERROR"
                        ? "text-red-300"
                        : issue.severity === "WARNING"
                          ? "text-amber-300"
                          : "text-zinc-500")
                    }
                  >
                    <span className="font-mono font-semibold">{issue.severity} · {issue.code}</span>
                    {" · "}
                    {issue.message}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/30 px-2 py-1.5">
      <dt className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-[11px] text-zinc-300">{value}</dd>
    </div>
  );
}