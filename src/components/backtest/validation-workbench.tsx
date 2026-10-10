"use client";

import { useMemo, useState } from "react";
import { RobustnessWorkbench } from "@/components/backtest/robustness-workbench";
import { StatisticalDiagnosticsWorkbench } from "@/components/backtest/statistical-diagnostics-workbench";
import { ReleaseGateWorkbench } from "@/components/backtest/release-gate-workbench";
import { StrategyVersionRegistryWorkbench } from "@/components/backtest/strategy-version-registry-workbench";
import { toComparableHistoricalPerformance } from "@/replay/backtest-analytics";
import type { HistoricalForwardComparison } from "@/replay/analytics-types";
import type {
  BacktestRunArtifact,
  BacktestRunListItem,
} from "@/replay/backtest-run-types";
import type { ForwardValidationSnapshot } from "@/forward-validation/types";
import { RDistribution } from "./validation-workbench/components/r-distribution";
import { MultiRunComparison } from "./validation-workbench/components/multi-run-comparison";
import { ForwardComparisonPanel } from "./validation-workbench/components/forward-comparison-panel";
import { SegmentExplorer } from "./validation-workbench/components/segment-explorer";
import { ReportIdentityPanel } from "./validation-workbench/components/report-identity-panel";
import { ComparabilityContext } from "./validation-workbench/components/comparability-context";

export function ValidationWorkbench({
  artifact,
  recentRuns,
  onArtifactUpdated,
  onRecentRunsRefresh,
}: {
  artifact: BacktestRunArtifact;
  recentRuns: BacktestRunListItem[];
  onArtifactUpdated: (artifact: BacktestRunArtifact) => void;
  onRecentRunsRefresh: () => Promise<void>;
}) {
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [forwardComparison, setForwardComparison] =
    useState<HistoricalForwardComparison | null>(null);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);

  const comparedRuns = useMemo(
    () =>
      comparisonIds
        .map((id) => recentRuns.find((run) => run.id === id))
        .filter((run): run is BacktestRunListItem => Boolean(run)),
    [comparisonIds, recentRuns]
  );

  const toggleComparison = (id: string) => {
    setComparisonIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };

  const compareWithPaper = async () => {
    if (forwardLoading) return;
    setForwardLoading(true);
    setForwardError(null);
    try {
      const response = await fetch("/api/forward-validation", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { ok: true; report: ForwardValidationSnapshot }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "Unable to read forward validation report." : payload.error
        );
      }
      if (payload.report.status === "NO_ACTIVE_RELEASE") {
        throw new Error(payload.report.message);
      }
      if (payload.report.release.sourceReportId !== artifact.id) {
        throw new Error(
          "The ACTIVE forward release belongs to historical report " +
            payload.report.release.sourceReportId +
            ", not this report."
        );
      }

      const expectedHistorical = toComparableHistoricalPerformance(
        artifact.analytics
      );
      if (
        expectedHistorical.sampleSize !==
          payload.report.comparison.historical.sampleSize
      ) {
        throw new Error(
          "Forward validation historical reference does not match this report."
        );
      }
      setForwardComparison(payload.report.comparison);
    } catch (error) {
      setForwardError(error instanceof Error ? error.message : String(error));
    } finally {
      setForwardLoading(false);
    }
  };

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">
            Phase 7
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            Validation workbench
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Review historical evidence alongside release-scoped forward Paper validation without changing strategy logic.
          </p>
        </div>
        <span className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1 font-mono text-[11px] text-zinc-500">
          {artifact.analytics.sampleSize} closed trades
        </span>
      </header>

      <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <RDistribution artifact={artifact} />
          <SegmentExplorer artifact={artifact} />
          <RobustnessWorkbench artifact={artifact} />
          <StatisticalDiagnosticsWorkbench artifact={artifact} />
          <ReleaseGateWorkbench
            artifact={artifact}
            forwardComparison={forwardComparison}
            onArtifactUpdated={onArtifactUpdated}
            onRecentRunsRefresh={onRecentRunsRefresh}
          />
          <StrategyVersionRegistryWorkbench artifact={artifact} />
          <MultiRunComparison
            runs={recentRuns}
            selectedIds={comparisonIds}
            selectedRuns={comparedRuns}
            onToggle={toggleComparison}
          />
          <ForwardComparisonPanel
            comparison={forwardComparison}
            loading={forwardLoading}
            error={forwardError}
            onCompare={compareWithPaper}
          />
        </div>

        <aside className="min-w-0">
          <ReportIdentityPanel
            artifact={artifact}
            onArtifactUpdated={onArtifactUpdated}
            onRecentRunsRefresh={onRecentRunsRefresh}
          />
          <ComparabilityContext artifact={artifact} />
        </aside>
      </div>
    </section>
  );
}