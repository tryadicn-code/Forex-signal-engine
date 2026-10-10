"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  BacktestRunArtifact,
  BacktestRunListItem,
} from "@/replay/backtest-run-types";
import type { HistoricalDatasetValidation } from "@/replay/import-types";
import type { BacktestJobSnapshot } from "@/server/backtest-job-registry";
import { ValidationWorkbench } from "@/components/backtest/validation-workbench";
import { apiFetch, ApiError } from "@/lib/api-client";
import { BacktestStepNav } from "./backtest-workspace/components/backtest-step-nav";
import { PersistedDetails } from "./backtest-workspace/components/persisted-details";
import { FileUploadSection } from "./backtest-workspace/components/file-upload-section";
import { SourceFormSection } from "./backtest-workspace/components/source-form-section";
import { ReplayFormSection } from "./backtest-workspace/components/replay-form-section";
import { FormIssuesBanner } from "./backtest-workspace/components/form-issues-banner";
import { BottomActionBar } from "./backtest-workspace/components/bottom-action-bar";
import { BacktestErrorBanner } from "./backtest-workspace/components/backtest-error-banner";
import { ValidationPanel } from "./backtest-workspace/components/validation-panel";
import { BacktestResultHeader } from "./backtest-workspace/components/backtest-result-header";
import { BacktestMetrics } from "./backtest-workspace/components/backtest-metrics";
import { EquityCurve } from "./backtest-workspace/components/equity-curve";
import { RecentRuns } from "./backtest-workspace/components/recent-runs";
import { JobProgressPanel } from "./backtest-workspace/components/job-progress-panel";
import {
  PRESETS,
  type BacktestPreset,
} from "./backtest-workspace/lib/presets";

type ApiRunResponse =
  | { ok: true; artifact: BacktestRunArtifact }
  | { ok: true; job: BacktestJobSnapshot }
  | {
      ok: false;
      error: string;
      validation?: HistoricalDatasetValidation;
    };

export function BacktestWorkspace() {
  const [files, setFiles] = useState<File[]>([]);
  const [datasetId, setDatasetId] = useState("mt5-validation");
  const [source, setSource] = useState("MT5 historical export");
  const [utcOffsetMinutes, setUtcOffsetMinutes] = useState("0");
  const [spreadPips, setSpreadPips] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialBalance, setInitialBalance] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("0.5");
  const [maxOpenPositions, setMaxOpenPositions] = useState("10");
  const [maxTotalRisk, setMaxTotalRisk] = useState("5");
  const [policy, setPolicy] = useState("STOP_FIRST");
  const [running, setRunning] = useState(false);
  const [artifact, setArtifact] = useState<BacktestRunArtifact | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobSnapshot, setJobSnapshot] = useState<BacktestJobSnapshot | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [validation, setValidation] =
    useState<HistoricalDatasetValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<BacktestRunListItem[]>([]);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const formIssues = useMemo(() => {
    const issues: string[] = [];
    if (files.length === 0) {
      issues.push("At least 1 pair required (D1 + H4 + H1 + M15 each).");
    } else if (files.length % 4 !== 0) {
      issues.push("File count must be a multiple of 4 (one pair = 4 timeframes).");
    }
    if (datasetId.trim() === "") {
      issues.push("Dataset id is required.");
    }
    if (source.trim() === "") {
      issues.push("Source label is required.");
    }
    if (!(Number(initialBalance) > 0)) {
      issues.push("Initial balance must be greater than 0.");
    }
    const rp = Number(riskPercent);
    if (!(rp > 0 && rp <= 100)) {
      issues.push("Risk per trade must be between 0 and 100.");
    }
    if (!(Number(maxOpenPositions) >= 1)) {
      issues.push("Max open positions must be at least 1.");
    }
    const mtr = Number(maxTotalRisk);
    if (!(mtr > 0)) {
      issues.push("Max total risk must be greater than 0.");
    } else if (rp > 0 && mtr < rp) {
      issues.push("Max total risk should be at least the risk per trade.");
    }
    return issues;
  }, [
    files.length,
    datasetId,
    source,
    initialBalance,
    riskPercent,
    maxOpenPositions,
    maxTotalRisk,
  ]);

  const refreshRecent = async () => {
    try {
      const response = await fetch("/api/backtest/runs?limit=10", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        ok: boolean;
        runs?: BacktestRunListItem[];
      };
      if (payload.ok && payload.runs) setRecentRuns(payload.runs);
    } catch {
      // Recent runs are secondary; a listing failure must not block new runs.
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshRecent();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let interval: number | null = null;

    const tick = async () => {
      try {
        const res = await fetch(
          "/api/backtest/runs/" + encodeURIComponent(jobId),
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const payload = (await res.json()) as
          | { ok: true; job: BacktestJobSnapshot }
          | { ok: true; artifact: BacktestRunArtifact };
        if (cancelled || !payload.ok) return;
        if ("job" in payload) {
          setJobSnapshot(payload.job);
          if (payload.job.status === "COMPLETED" && payload.job.artifact) {
            if (interval !== null) window.clearInterval(interval);
            setArtifact(payload.job.artifact);
            setValidation(payload.job.artifact.validation);
            void refreshRecent();
            setRunning(false);
            setJobId(null);
          } else if (payload.job.status === "FAILED") {
            if (interval !== null) window.clearInterval(interval);
            setError(payload.job.error ?? "Backtest failed.");
            setRunning(false);
            setJobId(null);
          } else if (payload.job.status === "CANCELLED") {
            if (interval !== null) window.clearInterval(interval);
            setError("Backtest cancelled.");
            setRunning(false);
            setJobId(null);
          }
        }
      } catch {
        // transient network error; keep polling
      }
    };

    interval = window.setInterval(tick, 1500);
    void tick();
    return () => {
      cancelled = true;
      if (interval !== null) window.clearInterval(interval);
    };
  }, [jobId]);

  const runBacktest = async () => {
    if (running || files.length === 0) return;
    setRunning(true);
    setError(null);
    setValidation(null);
    setJobSnapshot(null);
    let keepRunning = false;

    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      form.set("datasetId", datasetId);
      form.set("source", source);
      form.set("sourceUtcOffsetMinutes", utcOffsetMinutes);
      form.set("assumedSpreadPips", spreadPips);
      form.set("initialBalance", initialBalance);
      form.set("riskPercent", riskPercent);
      form.set("maxOpenPositions", maxOpenPositions);
      form.set("maxTotalOpenRiskPercent", maxTotalRisk);
      form.set("intrabarConflictPolicy", policy);
      form.set("maxReplaySteps", "50000");
      if (startDate) form.set("startAt", startDate);
      if (endDate) form.set("endAt", endDate);

      const payload = await apiFetch<ApiRunResponse>("/api/backtest/run", {
        method: "POST",
        body: form,
        cache: "no-store",
      });

      if (!payload.ok) {
        setError(payload.error);
        setValidation(payload.validation ?? null);
        return;
      }

      if ("job" in payload) {
        setJobId(payload.job.id);
        setJobSnapshot(payload.job);
        keepRunning = true;
        return;
      }

      setArtifact(payload.artifact);
      setValidation(payload.artifact.validation);
      await refreshRecent();
    } catch (runError) {
      if (runError instanceof ApiError) {
        if (runError.code === "UNAUTHORIZED") {
          setError(
            "Approval secret is required to run a backtest. Set it from the dialog, then try again."
          );
          return;
        }
        const body = runError.body as ApiRunResponse | null;
        if (body && body.ok === false) {
          setError(body.error);
          setValidation(body.validation ?? null);
          return;
        }
        setError(runError.message);
        return;
      }
      setError(
        runError instanceof Error ? runError.message : String(runError)
      );
    } finally {
      if (!keepRunning) setRunning(false);
    }
  };

  const cancelJob = async () => {
    if (!jobId || cancelling) return;
    if (
      !window.confirm(
        "Cancel the running backtest? Progress so far will be discarded."
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      await fetch("/api/backtest/runs/" + encodeURIComponent(jobId), {
        method: "DELETE",
      });
    } catch {
      // polling will surface the terminal state
    } finally {
      setCancelling(false);
    }
  };

  const loadPersistedRun = async (id: string) => {
    if (loadingRunId) return;
    setLoadingRunId(id);
    setError(null);
    try {
      const response = await fetch("/api/backtest/runs/" + encodeURIComponent(id), {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { ok: true; artifact: BacktestRunArtifact }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "Unable to load report." : payload.error);
        return;
      }
      setArtifact(payload.artifact);
      setValidation(payload.artifact.validation);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : String(loadError)
      );
    } finally {
      setLoadingRunId(null);
    }
  };

  const exportReport = () => {
    if (!artifact) return;
    const blob = new Blob([JSON.stringify(artifact, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.id + ".json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const applyPreset = (key: BacktestPreset) => {
    const p = PRESETS[key];
    setInitialBalance(p.balance);
    setRiskPercent(p.riskPercent);
    setMaxOpenPositions(p.maxOpenPositions);
    setMaxTotalRisk(p.maxTotalRisk);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 pb-32 sm:p-4 md:pb-20">
      <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
        <header className="border-b border-zinc-800 px-3 py-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">
            Phase 5.9 · Strategy Version Registry
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
                Historical backtest
              </h1>
              <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
                Import and validate historical data, complete human evidence review, and register immutable validated strategy versions without changing strategy logic.
              </p>
            </div>
            <Link
              href="/#overview"
              className="rounded border border-zinc-700 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              ← Live scanner
            </Link>
          </div>
        </header>

        <BacktestStepNav
          step1Done={files.length >= 4}
          step2Done={
            datasetId !== "mt5-validation" ||
            source !== "MT5 historical export"
          }
          step3Done={
            Number(initialBalance) > 0 &&
            Number(riskPercent) > 0 &&
            Number(maxTotalRisk) > 0 &&
            Number(maxOpenPositions) > 0
          }
        />

        <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="space-y-3">
            <FileUploadSection
              files={files}
              dragActive={dragActive}
              onFilesChange={setFiles}
              onDragActiveChange={setDragActive}
            />

            <PersistedDetails
              id="source"
              anchorId="backtest-step-2"
              title="2 - Source normalization"
            >
              <SourceFormSection
                datasetId={datasetId}
                source={source}
                utcOffsetMinutes={utcOffsetMinutes}
                spreadPips={spreadPips}
                onDatasetId={setDatasetId}
                onSource={setSource}
                onUtcOffsetMinutes={setUtcOffsetMinutes}
                onSpreadPips={setSpreadPips}
              />
            </PersistedDetails>

            <PersistedDetails
              id="replay"
              anchorId="backtest-step-3"
              title="3 - Replay window and risk"
            >
              <ReplayFormSection
                startDate={startDate}
                endDate={endDate}
                initialBalance={initialBalance}
                riskPercent={riskPercent}
                maxOpenPositions={maxOpenPositions}
                maxTotalRisk={maxTotalRisk}
                policy={policy}
                onStartDate={setStartDate}
                onEndDate={setEndDate}
                onInitialBalance={setInitialBalance}
                onRiskPercent={setRiskPercent}
                onMaxOpenPositions={setMaxOpenPositions}
                onMaxTotalRisk={setMaxTotalRisk}
                onPolicy={setPolicy}
                onApplyPreset={applyPreset}
              />
            </PersistedDetails>
          </div>

          <RecentRuns
            runs={recentRuns}
            loadingRunId={loadingRunId}
            onLoad={loadPersistedRun}
          />
        </div>
      </section>

      <FormIssuesBanner issues={formIssues} />

      <BottomActionBar
        running={running}
        jobId={jobId}
        cancelling={cancelling}
        filesCount={files.length}
        riskPercent={riskPercent}
        onRun={runBacktest}
        onCancel={cancelJob}
      />

      {jobSnapshot &&
        (jobSnapshot.status === "RUNNING" ||
          jobSnapshot.status === "PENDING") && (
          <JobProgressPanel
            job={jobSnapshot}
            cancelling={cancelling}
            onCancel={cancelJob}
          />
        )}

      <BacktestErrorBanner error={error} />

      {validation && <ValidationPanel validation={validation} />}

      {artifact && (
        <>
          <BacktestResultHeader artifact={artifact} onExport={exportReport} />
          <BacktestMetrics artifact={artifact} />
          <EquityCurve artifact={artifact} />
          <ValidationWorkbench
            key={artifact.id}
            artifact={artifact}
            recentRuns={recentRuns}
            onArtifactUpdated={(next) => {
              setArtifact(next);
              setValidation(next.validation);
            }}
            onRecentRunsRefresh={refreshRecent}
          />
        </>
      )}
    </div>
  );
}