"use client";

import { useEffect, useMemo, useState } from "react";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import { isReleaseReviewCurrent } from "@/replay/release-gate";
import type {
  StrategyVersionEntry,
  StrategyVersionRegistry,
} from "@/replay/strategy-version-types";

export function StrategyVersionRegistryWorkbench({
  artifact,
}: {
  artifact: BacktestRunArtifact;
}) {
  const [registry, setRegistry] = useState<StrategyVersionRegistry | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState(artifact.metadata?.label ?? "");
  const [note, setNote] = useState("");
  const [registeredBy, setRegisteredBy] = useState(
    artifact.releaseReview?.reviewer ?? ""
  );
  const [supersedesVersion, setSupersedesVersion] = useState("");
  const [deprecatingVersion, setDeprecatingVersion] = useState<string | null>(
    null
  );
  const [deprecateBy, setDeprecateBy] = useState(
    artifact.releaseReview?.reviewer ?? ""
  );
  const [deprecateReason, setDeprecateReason] = useState("");
  const [rollingBackVersion, setRollingBackVersion] = useState<string | null>(
    null
  );
  const [rollbackBy, setRollbackBy] = useState(
    artifact.releaseReview?.reviewer ?? ""
  );
  const [rollbackReason, setRollbackReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const response = await fetch("/api/backtest/strategy-versions", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Unable to read registry." : payload.error);
      }
      setRegistry(payload.registry);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : String(refreshError)
      );
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeVersion = useMemo(
    () =>
      registry?.entries.find((entry) => entry.currentStatus === "ACTIVE")
        ?.manifest.version ?? null,
    [registry]
  );

  const eligible =
    artifact.releaseReview?.decision === "PROMOTE" &&
    isReleaseReviewCurrent(artifact);

  const register = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/backtest/strategy-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version,
          title,
          note,
          registeredBy,
          sourceReportId: artifact.id,
          ...(supersedesVersion
            ? { supersedesVersion }
            : {}),
        }),
      });
      const payload = (await response.json()) as
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "Strategy registration failed." : payload.error
        );
      }
      setRegistry(payload.registry);
      setVersion("");
      setNote("");
      setSupersedesVersion("");
    } catch (registerError) {
      setError(
        registerError instanceof Error
          ? registerError.message
          : String(registerError)
      );
    } finally {
      setLoading(false);
    }
  };

  const rollback = async () => {
    if (!rollingBackVersion || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/backtest/strategy-versions/" +
          encodeURIComponent(rollingBackVersion),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ROLLBACK",
            changedBy: rollbackBy,
            reason: rollbackReason,
          }),
        }
      );
      const payload = (await response.json()) as
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "Rollback failed." : payload.error
        );
      }
      setRegistry(payload.registry);
      setRollingBackVersion(null);
      setRollbackReason("");
    } catch (rollbackError) {
      setError(
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError)
      );
    } finally {
      setLoading(false);
    }
  };

  const deprecate = async () => {
    if (!deprecatingVersion || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/backtest/strategy-versions/" +
          encodeURIComponent(deprecatingVersion),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "DEPRECATE",
            changedBy: deprecateBy,
            reason: deprecateReason,
          }),
        }
      );
      const payload = (await response.json()) as
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "Lifecycle update failed." : payload.error
        );
      }
      setRegistry(payload.registry);
      setDeprecatingVersion(null);
      setDeprecateReason("");
    } catch (deprecateError) {
      setError(
        deprecateError instanceof Error
          ? deprecateError.message
          : String(deprecateError)
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-emerald-400/80">
            Phase 6.5 · Release Governance
          </p>
          <h3 className="mt-0.5 text-xs font-semibold text-zinc-300">
            Strategy version registry
          </h3>
          <p className="mt-0.5 max-w-3xl text-[9px] leading-relaxed text-zinc-700">
            Immutable validated manifests with explicit supersession, controlled rollback and deprecation history.
          </p>
        </div>
        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[8px] text-zinc-500">
          {registry?.entries.length ?? 0} registered
        </span>
      </header>

      <div className="grid gap-3 p-3 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
          <h4 className="text-[10px] font-semibold text-zinc-400">
            Register promoted strategy
          </h4>
          <p className="mt-1 text-[8px] leading-relaxed text-zinc-700">
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
                  onChange={(event) =>
                    setSupersedesVersion(event.target.value)
                  }
                  className={inputClass}
                >
                  <option value="">Do not supersede</option>
                  <option value={activeVersion}>
                    Supersede {activeVersion}
                  </option>
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
              <div className="rounded border border-amber-900/60 bg-amber-950/20 px-2.5 py-2 text-[9px] leading-relaxed text-amber-300">
                Current report is not eligible. Save a current Phase 5.8 manual PROMOTE review first.
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded border border-red-900/60 bg-red-950/20 px-2.5 py-2 text-[9px] leading-relaxed text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={!eligible || loading}
              onClick={register}
              className="w-full rounded border border-emerald-800/70 bg-emerald-950/20 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-300 hover:bg-emerald-900/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Saving…" : "Register immutable version"}
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          {!registry || registry.entries.length === 0 ? (
            <div className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-8 text-center text-[10px] text-zinc-700">
              No strategy versions registered yet.
            </div>
          ) : (
            <div className="space-y-2">
              {registry.entries.map((entry) => (
                <VersionCard
                  key={entry.manifest.version}
                  entry={entry}
                  deprecating={deprecatingVersion === entry.manifest.version}
                  rollingBack={rollingBackVersion === entry.manifest.version}
                  deprecateBy={deprecateBy}
                  deprecateReason={deprecateReason}
                  rollbackBy={rollbackBy}
                  rollbackReason={rollbackReason}
                  disabled={loading}
                  onStartDeprecate={() => {
                    setRollingBackVersion(null);
                    setDeprecatingVersion(entry.manifest.version);
                    setDeprecateReason("");
                  }}
                  onStartRollback={() => {
                    setDeprecatingVersion(null);
                    setRollingBackVersion(entry.manifest.version);
                    setRollbackReason("");
                  }}
                  onCancelDeprecate={() => setDeprecatingVersion(null)}
                  onCancelRollback={() => setRollingBackVersion(null)}
                  onDeprecateBy={setDeprecateBy}
                  onDeprecateReason={setDeprecateReason}
                  onRollbackBy={setRollbackBy}
                  onRollbackReason={setRollbackReason}
                  onConfirmDeprecate={deprecate}
                  onConfirmRollback={rollback}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-[10px] normal-case tracking-normal text-zinc-300 outline-none focus:border-emerald-800";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-[8px] font-medium uppercase tracking-[0.08em] text-zinc-700">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block font-normal normal-case tracking-normal text-zinc-700">
          {hint}
        </span>
      )}
    </label>
  );
}

function VersionCard({
  entry,
  deprecating,
  rollingBack,
  deprecateBy,
  deprecateReason,
  rollbackBy,
  rollbackReason,
  disabled,
  onStartDeprecate,
  onStartRollback,
  onCancelDeprecate,
  onCancelRollback,
  onDeprecateBy,
  onDeprecateReason,
  onRollbackBy,
  onRollbackReason,
  onConfirmDeprecate,
  onConfirmRollback,
}: {
  entry: StrategyVersionEntry;
  deprecating: boolean;
  rollingBack: boolean;
  deprecateBy: string;
  deprecateReason: string;
  rollbackBy: string;
  rollbackReason: string;
  disabled: boolean;
  onStartDeprecate: () => void;
  onStartRollback: () => void;
  onCancelDeprecate: () => void;
  onCancelRollback: () => void;
  onDeprecateBy: (value: string) => void;
  onDeprecateReason: (value: string) => void;
  onRollbackBy: (value: string) => void;
  onRollbackReason: (value: string) => void;
  onConfirmDeprecate: () => Promise<void>;
  onConfirmRollback: () => Promise<void>;
}) {
  const manifest = entry.manifest;

  const exportManifest = () => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = manifest.version + "-strategy-manifest.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="rounded border border-zinc-800 bg-zinc-950/45">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-200">
              {manifest.version}
            </span>
            <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-zinc-400">
              {entry.currentStatus}
            </span>
          </div>
          <h4 className="mt-1 text-[10px] font-medium text-zinc-400">
            {manifest.title}
          </h4>
          <p className="mt-0.5 font-mono text-[8px] text-zinc-700">
            FP {manifest.manifestFingerprint} · report {manifest.sourceReportId}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={exportManifest}
            className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-emerald-800 hover:text-emerald-300"
          >
            Export manifest
          </button>
          {entry.currentStatus === "SUPERSEDED" && (
            <button
              type="button"
              disabled={disabled}
              onClick={onStartRollback}
              className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-sky-800 hover:text-sky-300 disabled:opacity-40"
            >
              Rollback
            </button>
          )}
          {entry.currentStatus !== "DEPRECATED" && (
            <button
              type="button"
              disabled={disabled}
              onClick={onStartDeprecate}
              className="rounded border border-zinc-800 px-2 py-1 text-[8px] text-zinc-500 hover:border-amber-800 hover:text-amber-300 disabled:opacity-40"
            >
              Deprecate
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-2 px-3 py-2 sm:grid-cols-4">
        <Fact label="Registered" value={shortUtc(manifest.registeredAt)} />
        <Fact label="By" value={manifest.registeredBy} />
        <Fact label="Release reviewer" value={manifest.releaseReviewer} />
        <Fact label="Symbols" value={manifest.symbols.join(", ")} />
      </div>

      <details className="border-t border-zinc-800">
        <summary className="cursor-pointer px-3 py-2 text-[9px] text-zinc-600">
          Lifecycle & validation identity
        </summary>
        <div className="grid gap-3 border-t border-zinc-800 p-3 lg:grid-cols-2">
          <div className="space-y-1">
            {entry.statusHistory.map((event, index) => (
              <div
                key={event.changedAt + "-" + index}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[8px] text-zinc-600"
              >
                <span className="font-mono font-semibold text-zinc-400">
                  {event.status}
                </span>
                {" · "}
                {shortUtc(event.changedAt)}
                {" · "}
                {event.changedBy}
                <div className="mt-0.5 text-zinc-700">{event.reason}</div>
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

      {rollingBack && (
        <div className="space-y-2 border-t border-zinc-800 bg-sky-950/10 p-3">
          <p className="text-[9px] text-sky-300">
            Controlled rollback reactivates this immutable SUPERSEDED manifest and supersedes the current ACTIVE release.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={rollbackBy}
              maxLength={80}
              onChange={(event) => onRollbackBy(event.target.value)}
              placeholder="Changed by"
              className={inputClass}
            />
            <input
              value={rollbackReason}
              maxLength={1000}
              onChange={(event) => onRollbackReason(event.target.value)}
              placeholder="Rollback reason"
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onConfirmRollback()}
              className="rounded border border-sky-800 px-2.5 py-1.5 text-[8px] font-semibold text-sky-300 disabled:opacity-40"
            >
              Confirm rollback
            </button>
            <button
              type="button"
              onClick={onCancelRollback}
              className="rounded border border-zinc-800 px-2.5 py-1.5 text-[8px] text-zinc-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {deprecating && (
        <div className="space-y-2 border-t border-zinc-800 bg-amber-950/10 p-3">
          <p className="text-[9px] text-amber-300">
            Deprecation is append-only and does not delete or alter this manifest.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={deprecateBy}
              maxLength={80}
              onChange={(event) => onDeprecateBy(event.target.value)}
              placeholder="Changed by"
              className={inputClass}
            />
            <input
              value={deprecateReason}
              maxLength={1000}
              onChange={(event) => onDeprecateReason(event.target.value)}
              placeholder="Deprecation reason"
              className={inputClass}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void onConfirmDeprecate()}
              className="rounded border border-amber-800 px-2.5 py-1.5 text-[8px] font-semibold text-amber-300 disabled:opacity-40"
            >
              Confirm deprecate
            </button>
            <button
              type="button"
              onClick={onCancelDeprecate}
              className="rounded border border-zinc-800 px-2.5 py-1.5 text-[8px] text-zinc-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
      <dt className="text-[7px] uppercase tracking-[0.08em] text-zinc-700">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-[8px] text-zinc-400">
        {value || "—"}
      </dd>
    </div>
  );
}

function shortUtc(value: number): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
