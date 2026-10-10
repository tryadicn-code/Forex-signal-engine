import { useMemo, useState } from "react";
import type { HistoricalSegmentDimension } from "@/replay/analytics-types";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  getHistoricalSegmentRows,
  segmentDimensionLabel,
} from "@/replay/validation-workbench";
import {
  formatNumber,
  formatPercent,
  formatSigned,
} from "@/lib/backtest-format";
import { SEGMENTS } from "../lib/segments";

export function SegmentExplorer({ artifact }: { artifact: BacktestRunArtifact }) {
  const [segment, setSegment] =
    useState<HistoricalSegmentDimension>("symbol");

  const segmentRows = useMemo(
    () => getHistoricalSegmentRows(artifact.analytics, segment),
    [artifact.analytics, segment]
  );

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/30">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold text-zinc-300">
            Segment explorer
          </h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Sample size stays visible for every subgroup.
          </p>
        </div>
        <select
          value={segment}
          onChange={(event) =>
            setSegment(event.target.value as HistoricalSegmentDimension)
          }
          className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-300 outline-none focus:border-emerald-800"
        >
          {SEGMENTS.map((item) => (
            <option key={item} value={item}>
              {segmentDimensionLabel(item)}
            </option>
          ))}
        </select>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-[11px]">
          <thead className="bg-zinc-950/60 text-zinc-600">
            <tr>
              <th className="px-3 py-2">{segmentDimensionLabel(segment)}</th>
              <th className="px-3 py-2">N</th>
              <th className="px-3 py-2">Win rate</th>
              <th className="px-3 py-2">Net R</th>
              <th className="px-3 py-2">Avg R</th>
              <th className="px-3 py-2">PF</th>
              <th className="px-3 py-2">Net P/L</th>
            </tr>
          </thead>
          <tbody>
            {segmentRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-4 text-center text-zinc-500"
                >
                  No closed trades for this segment.
                </td>
              </tr>
            ) : (
              segmentRows.map((row) => (
                <tr
                  key={row.key}
                  className="border-t border-zinc-800 text-zinc-400"
                >
                  <td className="px-3 py-2 font-medium text-zinc-200">
                    {row.label}
                  </td>
                  <td className="px-3 py-2 font-mono">{row.sampleSize}</td>
                  <td className="px-3 py-2 font-mono">
                    {formatPercent(row.winRate)}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {formatSigned(row.netR, 2)}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {formatSigned(row.averageR, 2)}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {formatNumber(row.profitFactor, 2)}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {formatSigned(row.netPnL, 2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}