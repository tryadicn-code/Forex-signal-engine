"use client";

import { useMemo, useState } from "react";
import type { HistoricalForwardComparison } from "@/replay/analytics-types";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  buildReleaseEvidenceReview,
  isReleaseReviewCurrent,
} from "@/replay/release-gate";
import type {
  ForwardEvidenceReviewState,
  ReleaseDecision,
  ReleaseReviewChecklist,
} from "@/replay/release-gate-types";

const EMPTY_CHECKLIST: ReleaseReviewChecklist = {
  datasetQualityReviewed: false,
  assumptionsReviewed: false,
  reproducibilityReviewed: false,
  outOfSampleReviewed: false,
  statisticsReviewed: false,
  forwardPaper: "NOT_REVIEWED",
};

export function ReleaseGateWorkbench({
  artifact,
  forwardComparison,
  onArtifactUpdated,
  onRecentRunsRefresh,
}: {
  artifact: BacktestRunArtifact;
  forwardComparison: HistoricalForwardComparison | null;
  onArtifactUpdated: (artifact: BacktestRunArtifact) => void;
  onRecentRunsRefresh: () => Promise<void>;
}) {
  const stored = artifact.releaseReview;
  const [reviewer, setReviewer] = useState(stored?.reviewer ?? "");
  const [note, setNote] = useState(stored?.note ?? "");
  const [decision, setDecision] = useState<ReleaseDecision>(
    stored?.decision ?? "PENDING"
  );
  const [checklist, setChecklist] = useState<ReleaseReviewChecklist>(
    stored?.checklist ? { ...stored.checklist } : { ...EMPTY_CHECKLIST }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evidence = useMemo(
    () =>
      buildReleaseEvidenceReview(artifact, {
        forwardEvidenceAvailable: forwardComparison !== null,
      }),
    [artifact, forwardComparison]
  );
  const current = useMemo(() => isReleaseReviewCurrent(artifact), [artifact]);

  const saveReview = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const forwardEvidence =
        checklist.forwardPaper === "REVIEWED"
          ? forwardComparison
            ? { capturedAt: Date.now(), comparison: forwardComparison }
            : stored?.forwardEvidence ?? null
          : null;

      const response = await fetch(
        "/api/backtest/runs/" + encodeURIComponent(artifact.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            releaseReview: {
              decision,
              reviewer,
              note,
              checklist,
              forwardEvidence,
            },
          }),
        }
      );
      const payload = (await response.json()) as
        | { ok: true; artifact: BacktestRunArtifact }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Release review update failed." : payload.error);
      }
      onArtifactUpdated(payload.artifact);
      await onRecentRunsRefresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
      <ReleaseGateHeader
        artifact={artifact}
        fingerprint={evidence.fingerprint}
        current={current}
      />
      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <EvidenceMatrix evidence={evidence} current={current} artifact={artifact} />
        <ReviewForm
          reviewer={reviewer}
          note={note}
          decision={decision}
          checklist={checklist}
          saving={saving}
          error={error}
          onReviewer={setReviewer}
          onNote={setNote}
          onDecision={setDecision}
          onChecklist={setChecklist}
          onSave={saveReview}
        />
      </div>
    </section>
  );
}
