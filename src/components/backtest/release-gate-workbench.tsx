"use client";

import { useMemo, useState } from "react";
import type { HistoricalForwardComparison } from "@/replay/analytics-types";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  buildReleaseEvidenceReview,
  buildReleaseGateAuditRecord,
  isReleaseReviewCurrent,
} from "@/replay/release-gate";
import type {
  ReleaseDecision,
  ReleaseReviewChecklist,
} from "@/replay/release-gate-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { EMPTY_CHECKLIST } from "./release-gate-workbench/lib/constants";
import { ReleaseGateHeader } from "./release-gate-workbench/components/release-gate-header";
import { EvidenceMatrix } from "./release-gate-workbench/components/evidence-matrix";
import { ReviewForm } from "./release-gate-workbench/components/review-form";

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

  const exportAuditRecord = () => {
    const record = buildReleaseGateAuditRecord(artifact);
    const blob = new Blob([JSON.stringify(record, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.id + "-release-gate.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

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

      const payload = await apiFetch<
        | { ok: true; artifact: BacktestRunArtifact }
        | { ok: false; error: string }
      >(
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
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      onArtifactUpdated(payload.artifact);
      await onRecentRunsRefresh();
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.code === "UNAUTHORIZED") {
        setError(
          "Approval secret is required to save the release review. Set it from the dialog, then try again."
        );
        return;
      }
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <ReleaseGateHeader
        artifact={artifact}
        fingerprint={evidence.fingerprint}
        current={current}
        onExport={exportAuditRecord}
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