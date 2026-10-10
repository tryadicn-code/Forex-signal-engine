import { useState } from "react";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";

export function ReportIdentityPanel({
  artifact,
  onArtifactUpdated,
  onRecentRunsRefresh,
}: {
  artifact: BacktestRunArtifact;
  onArtifactUpdated: (artifact: BacktestRunArtifact) => void;
  onRecentRunsRefresh: () => Promise<void>;
}) {
  const [label, setLabel] = useState(artifact.metadata?.label ?? "");
  const [tagsInput, setTagsInput] = useState(
    artifact.metadata?.tags.join(", ") ?? ""
  );
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const saveMetadata = async () => {
    if (savingMetadata) return;
    setSavingMetadata(true);
    setMetadataError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const response = await fetch(
        "/api/backtest/runs/" + encodeURIComponent(artifact.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, tags }),
        }
      );
      const payload = (await response.json()) as
        | { ok: true; artifact: BacktestRunArtifact }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Metadata update failed." : payload.error);
      }
      onArtifactUpdated(payload.artifact);
      await onRecentRunsRefresh();
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingMetadata(false);
    }
  };

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/30">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h3 className="text-xs font-semibold text-zinc-300">
          Report identity
        </h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Labels and tags are organizational only.
        </p>
      </header>
      <div className="space-y-3 p-3">
        <label className="block text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-600">
          Label
          <input
            value={label}
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. EURUSD conservative Q1"
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs normal-case tracking-normal text-zinc-300 outline-none focus:border-emerald-800"
          />
        </label>
        <label className="block text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-600">
          Tags
          <input
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder="baseline, mt5, conservative"
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs normal-case tracking-normal text-zinc-300 outline-none focus:border-emerald-800"
          />
          <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-zinc-500">
            Comma separated · max 8 tags
          </span>
        </label>
        {metadataError && (
          <p className="text-[11px] text-red-300">{metadataError}</p>
        )}
        <button
          type="button"
          onClick={saveMetadata}
          disabled={savingMetadata}
          className="w-full rounded border border-zinc-700 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-300 hover:border-emerald-800 hover:text-emerald-300 disabled:opacity-50"
        >
          {savingMetadata ? "Saving…" : "Save identity"}
        </button>
      </div>
    </section>
  );
}