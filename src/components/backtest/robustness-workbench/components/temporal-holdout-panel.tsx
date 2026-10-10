import { formatSigned, formatUtc } from "@/lib/backtest-format";
import { calculateTemporalHoldout } from "@/replay/robustness-validation";
import { Delta } from "./delta";
import { PeriodRow } from "./period-row";
import { formatSignedPercent } from "../lib/formatters";

export function TemporalHoldoutPanel({
  holdout,
}: {
  holdout: ReturnType<typeof calculateTemporalHoldout>;
}) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/40">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h4 className="text-[11px] font-semibold text-zinc-400">
          Temporal holdout
        </h4>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Split at {formatUtc(holdout.splitAt)}. Trades are assigned by entry time, not close time.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-[11px]">
          <thead className="bg-zinc-950/60 text-zinc-500">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Window</th>
              <th className="px-3 py-2">N</th>
              <th className="px-3 py-2">Win</th>
              <th className="px-3 py-2">PF</th>
              <th className="px-3 py-2">E[R]</th>
              <th className="px-3 py-2">Avg R</th>
              <th className="px-3 py-2">Net R</th>
              <th className="px-3 py-2">Max L streak</th>
            </tr>
          </thead>
          <tbody>
            <PeriodRow
              label="In-sample"
              startAt={holdout.inSample.startAt}
              endAt={holdout.inSample.endAt}
              metrics={holdout.inSample.metrics}
            />
            <PeriodRow
              label="Out-of-sample"
              startAt={holdout.outOfSample.startAt}
              endAt={holdout.outOfSample.endAt}
              metrics={holdout.outOfSample.metrics}
            />
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 gap-px border-t border-zinc-800 bg-zinc-800">
        <Delta label="Δ Win rate" value={formatSignedPercent(holdout.delta.winRate)} />
        <Delta label="Δ E[R]" value={formatSigned(holdout.delta.expectancyR, 2)} />
        <Delta label="Δ Avg R" value={formatSigned(holdout.delta.averageR, 2)} />
      </div>
    </section>
  );
}