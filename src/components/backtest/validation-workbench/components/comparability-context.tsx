import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import { formatShortDate } from "@/lib/backtest-format";

export function ComparabilityContext({
  artifact,
}: {
  artifact: BacktestRunArtifact;
}) {
  return (
    <section className="mt-3 rounded border border-zinc-800 bg-zinc-950/25 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
        Comparability context
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <Context label="Risk / trade" value={artifact.config.riskPercent + "%"} />
        <Context label="Spread" value={artifact.config.assumedSpreadPips + " pips"} />
        <Context label="Policy" value={artifact.config.intrabarConflictPolicy} />
        <Context label="Pairs" value={String(artifact.validation.symbols.length)} />
        <Context label="Start" value={formatShortDate(artifact.config.startAt)} />
        <Context label="End" value={formatShortDate(artifact.config.endAt)} />
      </dl>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        Compare results only after checking that data source, coverage, spread, risk and same-bar policy are compatible.
      </p>
    </section>
  );
}

function Context({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <dt className="uppercase tracking-[0.08em] text-zinc-500">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-zinc-400">{value}</dd>
    </div>
  );
}