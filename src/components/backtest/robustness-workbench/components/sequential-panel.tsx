import {
  formatNumber,
  formatPercent,
  formatShortDate,
  formatSigned,
} from "@/lib/backtest-format";
import { calculateSequentialValidation } from "@/replay/robustness-validation";

export function SequentialPanel({
  sequential,
}: {
  sequential: ReturnType<typeof calculateSequentialValidation>;
}) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/40">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h4 className="text-[11px] font-semibold text-zinc-400">
          Expanding-window sequential validation
        </h4>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Each fold expands development history, then measures the next untouched time window.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[11px]">
          <thead className="bg-zinc-950/60 text-zinc-500">
            <tr>
              <th className="px-3 py-2">Fold</th>
              <th className="px-3 py-2">Validation window</th>
              <th className="px-3 py-2">Dev N</th>
              <th className="px-3 py-2">OOS N</th>
              <th className="px-3 py-2">OOS Win</th>
              <th className="px-3 py-2">OOS PF</th>
              <th className="px-3 py-2">OOS E[R]</th>
              <th className="px-3 py-2">OOS Net R</th>
            </tr>
          </thead>
          <tbody>
            {sequential.folds.map((fold) => (
              <tr
                key={fold.index}
                className="border-t border-zinc-800 text-zinc-500"
              >
                <td className="px-3 py-2 font-mono text-zinc-300">
                  {fold.index}
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatShortDate(fold.validationStartAt)} → {formatShortDate(fold.validationEndAt)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {fold.development.sampleSize}
                </td>
                <td className="px-3 py-2 font-mono">
                  {fold.validation.sampleSize}
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatPercent(fold.validation.winRate)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatNumber(fold.validation.profitFactor, 2)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatSigned(fold.validation.expectancyR, 2)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatSigned(fold.validation.netR, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}