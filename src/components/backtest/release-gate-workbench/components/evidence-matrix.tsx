import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import type { buildReleaseEvidenceReview } from "@/replay/release-gate";

type Evidence = ReturnType<typeof buildReleaseEvidenceReview>;

export function EvidenceMatrix({
  evidence,
  current,
  artifact,
}: {
  evidence: Evidence;
  current: boolean;
  artifact: BacktestRunArtifact;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label="Satisfied" value={evidence.counts.SATISFIED} />
        <Count label="Attention" value={evidence.counts.ATTENTION} />
        <Count label="Missing" value={evidence.counts.MISSING} />
        <Count label="Info" value={evidence.counts.INFO} />
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        {evidence.items.map((item) => (
          <div
            key={item.id}
            className="grid gap-2 border-t border-zinc-800 bg-zinc-950/40 px-3 py-2 first:border-t-0 sm:grid-cols-[130px_150px_minmax(0,1fr)] sm:items-center"
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">
              {item.category}
            </div>
            <div>
              <span className="inline-flex rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-400">
                {item.status}
              </span>
              <div className="mt-1 text-[11px] font-medium text-zinc-400">
                {item.label}
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-600">
              {item.detail}
            </p>
          </div>
        ))}
      </div>

      {artifact.releaseReview && !current && (
        <div className="rounded border border-red-900/70 bg-red-950/20 px-3 py-2 text-[11px] leading-relaxed text-red-300">
          Stored review fingerprint no longer matches this report. Review again before relying on the stored decision.
        </div>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 px-2.5 py-2">
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-300">
        {value}
      </div>
    </div>
  );
}