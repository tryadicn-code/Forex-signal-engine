import { useState } from "react";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import { inputClass } from "../lib/constants";
import { Field } from "./field";

export type RegisterFormData = {
  version: string;
  title: string;
  note: string;
  registeredBy: string;
  supersedesVersion: string;
};

export function RegisterForm({
  artifact,
  activeVersion,
  eligible,
  loading,
  error,
  onSubmit,
}: {
  artifact: BacktestRunArtifact;
  activeVersion: string | null;
  eligible: boolean;
  loading: boolean;
  error: string | null;
  onSubmit: (data: RegisterFormData) => Promise<boolean>;
}) {
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState(artifact.metadata?.label ?? "");
  const [note, setNote] = useState("");
  const [registeredBy, setRegisteredBy] = useState(
    artifact.releaseReview?.reviewer ?? ""
  );
  const [supersedesVersion, setSupersedesVersion] = useState("");

  const handleSubmit = async () => {
    const ok = await onSubmit({
      version,
      title,
      note,
      registeredBy,
      supersedesVersion,
    });
    if (ok) {
      setVersion("");
      setNote("");
      setSupersedesVersion("");
    }
  };

  return (
    <aside className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
      <h4 className="text-[11px] font-semibold text-zinc-400">
        Register promoted strategy
      </h4>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Registration freezes the current strategy/scanner baseline together with its validation and release-gate evidence.
      </p>

      <div className="mt-3 space-y-2.5">
        <Field label="Version">
          <input
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            placeholder="v1.0.0"
            className={inputClass}
          />
        </Field>
        <Field label="Title">
          <input
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Validated baseline"
            className={inputClass}
          />
        </Field>
        <Field label="Registered by">
          <input
            value={registeredBy}
            maxLength={80}
            onChange={(event) => setRegisteredBy(event.target.value)}
            className={inputClass}
          />
        </Field>

        {activeVersion && (
          <Field
            label="Explicit supersession"
            hint={
              "Current ACTIVE is " +
              activeVersion +
              ". Select it explicitly to replace it."
            }
          >
            <select
              value={supersedesVersion}
              onChange={(event) => setSupersedesVersion(event.target.value)}
              className={inputClass}
            >
              <option value="">Do not supersede</option>
              <option value={activeVersion}>Supersede {activeVersion}</option>
            </select>
          </Field>
        )}

        <Field label="Registry note">
          <textarea
            value={note}
            rows={4}
            maxLength={2000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why this version is being registered."
            className={inputClass + " resize-y"}
          />
        </Field>

        {!eligible && (
          <div className="rounded border border-amber-900/60 bg-amber-950/20 px-2.5 py-2 text-[11px] leading-relaxed text-amber-300">
            Current report is not eligible. Save a current Phase 5.8 manual PROMOTE review first.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded border border-red-900/60 bg-red-950/20 px-2.5 py-2 text-[11px] leading-relaxed text-red-300"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={!eligible || loading}
          onClick={() => void handleSubmit()}
          className="w-full rounded border border-emerald-800/70 bg-emerald-950/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-300 hover:bg-emerald-900/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Saving…" : "Register immutable version"}
        </button>
      </div>
    </aside>
  );
}