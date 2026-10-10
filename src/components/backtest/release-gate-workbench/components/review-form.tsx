import type {
  ForwardEvidenceReviewState,
  ReleaseDecision,
  ReleaseReviewChecklist,
} from "@/replay/release-gate-types";
import { ReviewCheck } from "./review-check";

export function ReviewForm({
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
        <h4 className="text-[11px] font-semibold text-zinc-400">
          Manual reviewer checklist
        </h4>
        <p className="mt-0.5 text-[11px] text-zinc-500">
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

        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          Forward Paper evidence
          <select
            value={checklist.forwardPaper}
            onChange={(event) =>
              onChecklist({
                ...checklist,
                forwardPaper: event.target.value as ForwardEvidenceReviewState,
              })
            }
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-400 outline-none focus:border-sky-800"
          >
            <option value="NOT_REVIEWED">NOT_REVIEWED</option>
            <option value="REVIEWED">REVIEWED</option>
            <option value="WAIVED">WAIVED</option>
          </select>
          <span className="mt-1 block font-normal normal-case tracking-normal text-zinc-500">
            REVIEWED requires a captured Paper comparison. WAIVED records an explicit reviewer choice to proceed without one.
          </span>
        </label>

        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          Reviewer
          <input
            value={reviewer}
            maxLength={80}
            onChange={(event) => onReviewer(event.target.value)}
            placeholder="Name / reviewer id"
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[11px] normal-case tracking-normal text-zinc-300 outline-none focus:border-sky-800"
          />
        </label>

        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          Reviewer note
          <textarea
            value={note}
            maxLength={2000}
            rows={4}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Document concerns, caveats, reasons or next-stage conditions."
            className="mt-1 w-full resize-y rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[11px] normal-case tracking-normal text-zinc-300 outline-none focus:border-sky-800"
          />
        </label>

        <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          Reviewer decision
          <select
            value={decision}
            onChange={(event) =>
              onDecision(event.target.value as ReleaseDecision)
            }
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-[11px] font-semibold text-zinc-300 outline-none focus:border-sky-800"
          >
            <option value="PENDING">PENDING</option>
            <option value="HOLD">HOLD</option>
            <option value="PROMOTE">PROMOTE</option>
          </select>
        </label>

        {error && (
          <div
            role="alert"
            className="rounded border border-red-900/70 bg-red-950/20 px-2.5 py-2 text-[11px] leading-relaxed text-red-300"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="w-full rounded border border-sky-800/70 bg-sky-950/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-sky-300 hover:bg-sky-900/25 disabled:opacity-50"
        >
          {saving ? "Saving review…" : "Save release review"}
        </button>

        <p className="text-[11px] leading-relaxed text-zinc-500">
          PROMOTE requires all core checklist items and Forward Paper marked REVIEWED or WAIVED. Evidence warnings remain visible and do not become an automatic decision.
        </p>
      </div>
    </aside>
  );
}