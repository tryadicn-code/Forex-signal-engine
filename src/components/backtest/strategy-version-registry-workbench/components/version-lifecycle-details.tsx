import type { StrategyVersionEntry } from "@/replay/strategy-version-types";
import { formatUtc } from "@/lib/backtest-format";
import { Fact } from "./fact";

export function VersionLifecycleDetails({
  entry,
}: {
  entry: StrategyVersionEntry;
}) {
  const manifest = entry.manifest;

  return (
    <details className="border-t border-zinc-800">
      <summary className="cursor-pointer px-3 py-2 text-[11px] text-zinc-600">
        Lifecycle & validation identity
      </summary>
      <div className="grid gap-3 border-t border-zinc-800 p-3 lg:grid-cols-2">
        <div className="space-y-1">
          {entry.statusHistory.map((event, index) => (
            <div
              key={event.changedAt + "-" + index}
              className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-600"
            >
              <span className="font-mono font-semibold text-zinc-400">
                {event.status}
              </span>
              {" · "}
              {formatUtc(event.changedAt)}
              {" · "}
              {event.changedBy}
              <div className="mt-0.5 text-zinc-500">{event.reason}</div>
            </div>
          ))}
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <Fact label="Validation FP" value={manifest.reproducibility.combined} />
          <Fact label="Assumption FP" value={manifest.reproducibility.assumptions} />
          <Fact
            label="Trigger score"
            value={String(
              manifest.strategySnapshot.engineConfig.trigger.minTriggerScore
            )}
          />
          <Fact
            label="Setup score"
            value={String(
              manifest.strategySnapshot.engineConfig.setup.minSetupScore
            )}
          />
        </dl>
      </div>
    </details>
  );
}