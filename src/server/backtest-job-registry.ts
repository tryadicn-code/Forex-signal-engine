import type { BacktestRunArtifact } from "@/replay/backtest-run-types";

export type BacktestJobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/**
 * Client-safe view of a backtest job. Never contains the AbortController.
 */
export type BacktestJobSnapshot = {
  id: string;
  datasetId: string;
  status: BacktestJobStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  completedSteps: number;
  totalSteps: number;
  lastProgressAt: number | null;
  artifact: BacktestRunArtifact | null;
  error: string | null;
};

/**
 * Server-side job record. Kept on globalThis so a Next.js dev HMR reload
 * does not orphan an in-flight replay. Single-process only; if the server
 * restarts mid-run, the job is lost and the client will see 404 on poll.
 */
export type BacktestJobInternal = BacktestJobSnapshot & {
  abortController: AbortController;
};

type BacktestJobGlobal = typeof globalThis & {
  __fseBacktestJobs?: Map<string, BacktestJobInternal>;
};

function registry(): Map<string, BacktestJobInternal> {
  const runtime = globalThis as BacktestJobGlobal;
  if (!runtime.__fseBacktestJobs) {
    runtime.__fseBacktestJobs = new Map();
  }
  return runtime.__fseBacktestJobs;
}

export function createBacktestJob(datasetId: string): BacktestJobInternal {
  const id =
    "bt-job-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8);
  const job: BacktestJobInternal = {
    id,
    datasetId,
    status: "PENDING",
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    completedSteps: 0,
    totalSteps: 0,
    lastProgressAt: null,
    artifact: null,
    error: null,
    abortController: new AbortController(),
  };
  registry().set(id, job);
  return job;
}

export function getBacktestJob(id: string): BacktestJobInternal | null {
  return registry().get(id) ?? null;
}

export function snapshotBacktestJob(
  job: BacktestJobInternal
): BacktestJobSnapshot {
  return {
    id: job.id,
    datasetId: job.datasetId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    completedSteps: job.completedSteps,
    totalSteps: job.totalSteps,
    lastProgressAt: job.lastProgressAt,
    artifact: job.artifact,
    error: job.error,
  };
}

export function cancelBacktestJob(id: string): boolean {
  const job = registry().get(id);
  if (!job) return false;
  if (job.status !== "PENDING" && job.status !== "RUNNING") return false;
  job.abortController.abort();
  return true;
}