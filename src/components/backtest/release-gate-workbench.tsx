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
  ForwardEvidenceReviewState,
  ReleaseDecision,
  ReleaseReviewChecklist,
} from "@/replay/release-gate-types";
import { apiFetch, ApiError } from "@/lib/api-client";

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
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
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


function ReleaseGateHeader({
  artifact,
  fingerprint,
  current,
  onExport,
}: {
  artifact: BacktestRunArtifact;
  fingerprint: string;
  current: boolean;
  onExport: () => void;
}) {
  const state =
    artifact.releaseReview === undefined
      ? "UNREVIEWED"
      : current
        ? artifact.releaseReview.decision
        : "STALE";

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-sky-400/80">
          Phase 5.8
        </p>
        <h3 className="mt-0.5 text-xs font-semibold text-zinc-300">
          Validation evidence & release gate
        </h3>
        <p className="mt-0.5 max-w-3xl text-[9px] leading-relaxed text-zinc-700">
          Evidence status is descriptive. The stored release decision is entered manually by a reviewer.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] font-semibold text-zinc-400">
          {state}
        </span>
        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-600">
          FP {fingerprint}
        </span>
        <button
          type="button"
          onClick={onExport}
          className="rounded border border-zinc-700 px-2 py-1 font-mono text-[11px] text-zinc-500 hover:border-sky-800 hover:text-sky-300"
        >
          Export gate JSON
        </button>
      </div>
    </header>
  );
}

function EvidenceMatrix({
  evidence,
  current,
  artifact,
}: {
  evidence: ReturnType<typeof buildReleaseEvidenceReview>;
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
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-700">
              {item.category}
            </div>
            <div>
              <span className="inline-flex rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-400">
                {item.status}
              </span>
              <div className="mt-1 text-[9px] font-medium text-zinc-400">
                {item.label}
              </div>
            </div>
            <p className="text-[9px] leading-relaxed text-zinc-600">
              {item.detail}
            </p>
          </div>
        ))}
      </div>

      {artifact.releaseReview && !current && (
        <div className="rounded border border-red-900/70 bg-red-950/20 px-3 py-2 text-[9px] leading-relaxed text-red-300">
          Stored review fingerprint no longer matches this report. Review again before relying on the stored decision.
        </div>
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 px-2.5 py-2">
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-zinc-300">
        {value}
      </div>
    </div>
  );
}


function ReviewForm({
  reviewer,
  note,
  decision,
  checklist,
  saving,
  error,
  onReviewer,
  onNote,
  onDecision,
  onChecklist,
  onSave,
}: {
  reviewer: string;
  note: string;
  decision: ReleaseDecision;
  checklist: ReleaseReviewChecklist;
  saving: boolean;
  error: string | null;
  onReviewer: (value: string) => void;
  onNote: (value: string) => void;
  onDecision: (value: ReleaseDecision) => void;
  onChecklist: (value: ReleaseReviewChecklist) => void;
  onSave: () => Promise<void>;
}) {
  const toggle = (
    key: Exclude<keyof ReleaseReviewChecklist, "forwardPaper">
  ) => {
    onChecklist({ ...checklist, [key]: !checklist[key] });
  };

  return (
    <aside className="rounded border border-zinc-800 bg-zinc-950/50">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h4 className="text-[10px] font-semibold text-zinc-400">
          Manual reviewer checklist
        </h4>
        <p className="mt-0.5 text-[11px] text-zinc-700">
          A checked item means it was reviewed, not that the evidence was favorable.
        </p>
      </header>

      <div className="space-y-2.5 p-3">
        <ReviewCheck
          label="Dataset quality / import warnings reviewed"
          checked={checklist.datasetQualityReviewed}
          onChange={() => toggle("datasetQualityReviewed")}
        />
        <ReviewCheck
          label="Execution assumptions reviewed"
          checked={checklist.assumptionsReviewed}
          onChange={() => toggle("assumptionsReviewed")}
        />
        <ReviewCheck
          label="Reproducibility fingerprint reviewed"
          checked={checklist.reproducibilityReviewed}
          onChange={() => toggle("reproducibilityReviewed")}
        />
        <ReviewCheck
          label="OOS / sequential evidence reviewed"
          checked={checklist.outOfSampleReviewed}
          onChange={() => toggle("outOfSampleReviewed")}
        />
        <ReviewCheck
          label="Statistical diagnostics / warnings reviewed"
          checked={checklist.statisticsReviewed}
          onChange={() => toggle("statisticsReviewed")}
        />

        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-700">
          Forward Paper evidence
          <select
            value={checklist.forwardPaper}
            onChange={(event) =>
              onChecklist({
                ...checklist,
                forwardPaper: event.target.value as ForwardEvidenceReviewState,
              })
            }
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[9px] text-zinc-400 outline-none focus:border-sky-800"
          >
            <option value="NOT_REVIEWED">NOT_REVIEWED</option>
            <option value="REVIEWED">REVIEWED</option>
            <option value="WAIVED">WAIVED</option>
          </select>
          <span className="mt-1 block font-normal normal-case tracking-normal text-zinc-700">
            REVIEWED requires a captured Paper comparison. WAIVED records an explicit reviewer choice to proceed without one.
          </span>
        </label>

        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-700">
          Reviewer
          <input
            value={reviewer}
            maxLength={80}
            onChange={(event) => onReviewer(event.target.value)}
            placeholder="Name / reviewer id"
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[10px] normal-case tracking-normal text-zinc-300 outline-none focus:border-sky-800"
          />
        </label>

        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-700">
          Reviewer note
          <textarea
            value={note}
            maxLength={2000}
            rows={4}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Document concerns, caveats, reasons or next-stage conditions."
            className="mt-1 w-full resize-y rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[10px] normal-case tracking-normal text-zinc-300 outline-none focus:border-sky-800"
          />
        </label>

        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-700">
          Reviewer decision
          <select
            value={decision}
            onChange={(event) =>
              onDecision(event.target.value as ReleaseDecision)
            }
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-[10px] font-semibold text-zinc-300 outline-none focus:border-sky-800"
          >
            <option value="PENDING">PENDING</option>
            <option value="HOLD">HOLD</option>
            <option value="PROMOTE">PROMOTE</option>
          </select>
        </label>

        {error && (
          <div
            role="alert"
            className="rounded border border-red-900/70 bg-red-950/20 px-2.5 py-2 text-[9px] leading-relaxed text-red-300"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="w-full rounded border border-sky-800/70 bg-sky-950/20 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-sky-300 hover:bg-sky-900/25 disabled:opacity-50"
        >
          {saving ? "Saving review…" : "Save release review"}
        </button>

        <p className="text-[11px] leading-relaxed text-zinc-700">
          PROMOTE requires all core checklist items and Forward Paper marked REVIEWED or WAIVED. Evidence warnings remain visible and do not become an automatic decision.
        </p>
      </div>
    </aside>
  );
}

function ReviewCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded border border-zinc-800 bg-zinc-950/45 px-2.5 py-2 text-[9px] text-zinc-500">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-sky-500"
      />
      <span>{label}</span>
    </label>
  );
}
