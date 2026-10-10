import type { RobustnessPeriodMetrics } from "@/replay/robustness-types";
import {
  formatNumber,
  formatPercent,
  formatShortDate,
  formatSigned,
} from "@/lib/backtest-format";

export function PeriodRow({
  label,
  startAt,
  endAt,
  metrics,
}: {
  label: string;
  startAt: number;
  endAt: number;
  metrics: RobustnessPeriodMetrics;
}) {
  return (
    <tr className="border-t border-zinc-800 text-zinc-500">
      <td className="px-3 py-2 font-medium text-zinc-300">{label}</td>
      <td className="px-3 py-2 font-mono">
        {formatShortDate(startAt)} → {formatShortDate(endAt)}
      </td>
      <td className="px-3 py-2 font-mono">{metrics.sampleSize}</td>
      <td className="px-3 py-2 font-mono">{formatPercent(metrics.winRate)}</td>
      <td className="px-3 py-2 font-mono">
        {formatNumber(metrics.profitFactor, 2)}
      </td>
      <td className="px-3 py-2 font-mono">
        {formatSigned(metrics.expectancyR, 2)}
      </td>
      <td className="px-3 py-2 font-mono">
        {formatSigned(metrics.averageR, 2)}
      </td>
      <td className="px-3 py-2 font-mono">
        {formatSigned(metrics.netR, 2)}
      </td>
      <td className="px-3 py-2 font-mono">
        {metrics.maxConsecutiveLosses}
      </td>
    </tr>
  );
}