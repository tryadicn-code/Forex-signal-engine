"use client";

import { useEffect, useMemo, useState } from "react";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import { isReleaseReviewCurrent } from "@/replay/release-gate";
import type { StrategyVersionRegistry } from "@/replay/strategy-version-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  RegisterForm,
  type RegisterFormData,
} from "./strategy-version-registry-workbench/components/register-form";
import { VersionCard } from "./strategy-version-registry-workbench/components/version-card";

export function StrategyVersionRegistryWorkbench({
  artifact,
}: {
  artifact: BacktestRunArtifact;
}) {
  const [registry, setRegistry] = useState<StrategyVersionRegistry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const register = async (data: RegisterFormData): Promise<boolean> => {
    if (loading) return false;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string }
      >("/api/backtest/strategy-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: data.version,
          title: data.title,
          note: data.note,
          registeredBy: data.registeredBy,
          sourceReportId: artifact.id,
          ...(data.supersedesVersion
            ? { supersedesVersion: data.supersedesVersion }
            : {}),
        }),
      });
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      setRegistry(payload.registry);
      return true;
    } catch (registerError) {
      if (
        registerError instanceof ApiError &&
        registerError.code === "UNAUTHORIZED"
      ) {
        setError(
          "Approval secret is required to register a strategy version. Set it from the dialog, then try again."
        );
        return false;
      }
      setError(
        registerError instanceof Error
          ? registerError.message
          : String(registerError)
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  const rollback = async () => {
    if (!rollingBackVersion || loading) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string }
      >(
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
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      setRegistry(payload.registry);
      setRollingBackVersion(null);
      setRollbackReason("");
    } catch (rollbackError) {
      if (
        rollbackError instanceof ApiError &&
        rollbackError.code === "UNAUTHORIZED"
      ) {
        setError(
          "Approval secret is required to rollback. Set it from the dialog, then try again."
        );
        return;
      }
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
      const payload = await apiFetch<
        | { ok: true; registry: StrategyVersionRegistry }
        | { ok: false; error: string }
      >(
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
      if (!payload.ok) {
        throw new Error(payload.error);
      }
      setRegistry(payload.registry);
      setDeprecatingVersion(null);
      setDeprecateReason("");
    } catch (deprecateError) {
      if (
        deprecateError instanceof ApiError &&
        deprecateError.code === "UNAUTHORIZED"
      ) {
        setError(
          "Approval secret is required to deprecate. Set it from the dialog, then try again."
        );
        return;
      }
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
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-400/80">
            Phase 6.5 · Release Governance
          </p>
          <h3 className="mt-0.5 text-xs font-semibold text-zinc-300">
            Strategy version registry
          </h3>
          <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
            Immutable validated manifests with explicit supersession, controlled rollback and deprecation history.
          </p>
        </div>
        <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-500">
          {registry?.entries.length ?? 0} registered
        </span>
      </header>

      <div className="grid gap-3 p-3 xl:grid-cols-[360px_minmax(0,1fr)]">
        <RegisterForm
          artifact={artifact}
          activeVersion={activeVersion}
          eligible={eligible}
          loading={loading}
          error={error}
          onSubmit={register}
        />

        <div className="min-w-0">
          {!registry || registry.entries.length === 0 ? (
            <div className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-8 text-center text-[11px] text-zinc-500">
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