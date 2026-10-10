import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  formatNumber,
  formatPercent,
  formatSigned,
  signedPercent,
} from "../lib/formatters";

export function BacktestMetrics({ artifact }: { artifact: BacktestRunArtifact }) {
  const analytics = artifact.analytics;
  const metrics = [
    ["Trades", analytics.sampleSize.toLocaleString()],
    ["Win rate", formatPercent(analytics.winRate)],
    ["Net return", signedPercent(analytics.netReturnPercent)],
    ["Profit factor", formatNumber(analytics.profitFactor, 2)],
    ["Expectancy R", formatSigned(analytics.expectancyR, 2)],
    ["Avg R", formatSigned(analytics.averageR, 2)],
    ["Max equity DD", formatPercent(analytics.maxEquityDrawdownPercent)],
    ["Net P/L", formatSigned(analytics.netPnL, 2)],
  ];

  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 sm:grid-cols-4 xl:grid-cols-8">
      {metrics.map(([label, value]) => (
        <div key={label} className="bg-[#0f131b] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.1em] text-zinc-600">
            {label}
          </div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-zinc-200">
            {value}
          </div>
        </div>
      ))}
    </section>
  );
}