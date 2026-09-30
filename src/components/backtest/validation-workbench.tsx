"use client";

import { useMemo, useState } from "react";
import { RobustnessWorkbench } from "@/components/backtest/robustness-workbench";
import { StatisticalDiagnosticsWorkbench } from "@/components/backtest/statistical-diagnostics-workbench";
import { ReleaseGateWorkbench } from "@/components/backtest/release-gate-workbench";
import {
  compareHistoricalToForward,
  toComparableHistoricalPerformance,
} from "@/replay/backtest-analytics";
import type {
  HistoricalForwardComparison,
  HistoricalSegmentDimension,
} from "@/replay/analytics-types";
import type {
  BacktestRunArtifact,
  BacktestRunListItem,
} from "@/replay/backtest-run-types";
import {
  getHistoricalSegmentRows,
  segmentDimensionLabel,
  toComparablePaperPerformance,
} from "@/replay/validation-workbench";
import type { DashboardData } from "@/types/dashboard";

const SEGMENTS: HistoricalSegmentDimension[] = [
  "symbol",
  "direction",
  "bias",
  "setupScore",
  "entrySession",
  "closeReason",
];

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
  const [segment, setSegment] =
    useState<HistoricalSegmentDimension>("symbol");
  const [label, setLabel] = useState(artifact.metadata?.label ?? "");
  const [tagsInput, setTagsInput] = useState(
    artifact.metadata?.tags.join(", ") ?? ""
  );
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [forwardComparison, setForwardComparison] =
    useState<HistoricalForwardComparison | null>(null);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);

  const segmentRows = useMemo(
    () => getHistoricalSegmentRows(artifact.analytics, segment),
    [artifact.analytics, segment]
  );

  const comparedRuns = useMemo(
    () =>
      comparisonIds
        .map((id) => recentRuns.find((run) => run.id === id))
        .filter((run): run is BacktestRunListItem => Boolean(run)),
    [comparisonIds, recentRuns]
  );

  const saveMetadata = async () => {
    if (savingMetadata) return;
    setSavingMetadata(true);
    setMetadataError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const response = await fetch(
        "/api/backtest/runs/" + encodeURIComponent(artifact.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, tags }),
        }
      );
      const payload = (await response.json()) as
        | { ok: true; artifact: BacktestRunArtifact }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "Metadata update failed." : payload.error);
      }
      onArtifactUpdated(payload.artifact);
      await onRecentRunsRefresh();
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingMetadata(false);
    }
  };

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
      const response = await fetch("/api/scanner", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to read current Paper Trading summary.");
      }
      const dashboard = (await response.json()) as DashboardData;
      if (!dashboard.paper) {
        throw new Error("Paper Trading summary is unavailable.");
      }

      const historical = toComparableHistoricalPerformance(artifact.analytics);
      const forward = toComparablePaperPerformance(dashboard.paper);
      setForwardComparison(compareHistoricalToForward(historical, forward));
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
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">
            Phase 5.8
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
            Validation workbench
          </h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Organize, segment and compare validation evidence without changing strategy logic.
          </p>
        </div>
        <span className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1 font-mono text-[9px] text-zinc-500">
          {artifact.analytics.sampleSize} closed trades
        </span>
      </header>

      <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <RDistribution artifact={artifact} />

          <section className="rounded border border-zinc-800 bg-zinc-950/25">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
              <div>
                <h3 className="text-xs font-semibold text-zinc-300">
                  Segment explorer
                </h3>
                <p className="mt-0.5 text-[9px] text-zinc-700">
                  Sample size stays visible for every subgroup.
                </p>
              </div>
              <select
                value={segment}
                onChange={(event) =>
                  setSegment(event.target.value as HistoricalSegmentDimension)
                }
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[10px] text-zinc-300 outline-none focus:border-emerald-800"
              >
                {SEGMENTS.map((item) => (
                  <option key={item} value={item}>
                    {segmentDimensionLabel(item)}
                  </option>
                ))}
              </select>
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-[10px]">
                <thead className="bg-zinc-950/60 text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">{segmentDimensionLabel(segment)}</th>
                    <th className="px-3 py-2">N</th>
                    <th className="px-3 py-2">Win rate</th>
                    <th className="px-3 py-2">Net R</th>
                    <th className="px-3 py-2">Avg R</th>
                    <th className="px-3 py-2">PF</th>
                    <th className="px-3 py-2">Net P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-4 text-center text-zinc-700"
                      >
                        No closed trades for this segment.
                      </td>
                    </tr>
                  ) : (
                    segmentRows.map((row) => (
                      <tr
                        key={row.key}
                        className="border-t border-zinc-800 text-zinc-400"
                      >
                        <td className="px-3 py-2 font-medium text-zinc-200">
                          {row.label}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.sampleSize}</td>
                        <td className="px-3 py-2 font-mono">
                          {formatPercent(row.winRate)}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {formatSigned(row.netR, 2)}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {formatSigned(row.averageR, 2)}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {formatNumber(row.profitFactor, 2)}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {formatSigned(row.netPnL, 2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <RobustnessWorkbench artifact={artifact} />

          <StatisticalDiagnosticsWorkbench artifact={artifact} />

          <ReleaseGateWorkbench
            artifact={artifact}
            forwardComparison={forwardComparison}
            onArtifactUpdated={onArtifactUpdated}
            onRecentRunsRefresh={onRecentRunsRefresh}
          />

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
          <section className="rounded border border-zinc-800 bg-zinc-950/25">
            <header className="border-b border-zinc-800 px-3 py-2">
              <h3 className="text-xs font-semibold text-zinc-300">
                Report identity
              </h3>
              <p className="mt-0.5 text-[9px] text-zinc-700">
                Labels and tags are organizational only.
              </p>
            </header>
            <div className="space-y-3 p-3">
              <label className="block text-[9px] font-medium uppercase tracking-[0.1em] text-zinc-600">
                Label
                <input
                  value={label}
                  maxLength={80}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="e.g. EURUSD conservative Q1"
                  className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs normal-case tracking-normal text-zinc-300 outline-none focus:border-emerald-800"
                />
              </label>
              <label className="block text-[9px] font-medium uppercase tracking-[0.1em] text-zinc-600">
                Tags
                <input
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="baseline, mt5, conservative"
                  className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs normal-case tracking-normal text-zinc-300 outline-none focus:border-emerald-800"
                />
                <span className="mt-1 block text-[9px] font-normal normal-case tracking-normal text-zinc-700">
                  Comma separated · max 8 tags
                </span>
              </label>
              {metadataError && (
                <p className="text-[9px] text-red-300">{metadataError}</p>
              )}
              <button
                type="button"
                onClick={saveMetadata}
                disabled={savingMetadata}
                className="w-full rounded border border-zinc-700 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-300 hover:border-emerald-800 hover:text-emerald-300 disabled:opacity-50"
              >
                {savingMetadata ? "Saving…" : "Save identity"}
              </button>
            </div>
          </section>

          <section className="mt-3 rounded border border-zinc-800 bg-zinc-950/25 p-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
              Comparability context
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
              <Context label="Risk / trade" value={artifact.config.riskPercent + "%"} />
              <Context label="Spread" value={artifact.config.assumedSpreadPips + " pips"} />
              <Context label="Policy" value={artifact.config.intrabarConflictPolicy} />
              <Context label="Pairs" value={String(artifact.validation.symbols.length)} />
              <Context label="Start" value={shortDate(artifact.config.startAt)} />
              <Context label="End" value={shortDate(artifact.config.endAt)} />
            </dl>
            <p className="mt-2 text-[9px] leading-relaxed text-zinc-700">
              Compare results only after checking that data source, coverage, spread, risk and same-bar policy are compatible.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}

function RDistribution({ artifact }: { artifact: BacktestRunArtifact }) {
  const bins = artifact.analytics.rDistribution;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h3 className="text-xs font-semibold text-zinc-300">R distribution</h3>
        <p className="mt-0.5 text-[9px] text-zinc-700">
          Closed-trade outcome distribution; bins are mutually exclusive.
        </p>
      </header>
      <div className="grid grid-cols-5 gap-2 p-3">
        {bins.map((bin) => (
          <div key={bin.key} className="min-w-0">
            <div className="flex h-20 items-end overflow-hidden rounded bg-zinc-900">
              <div
                className="w-full bg-emerald-700/55"
                style={{
                  height:
                    bin.count === 0
                      ? "0%"
                      : Math.max(8, (bin.count / maxCount) * 100) + "%",
                }}
              />
            </div>
            <div className="mt-1 truncate text-center font-mono text-[8px] text-zinc-600">
              {bin.label}
            </div>
            <div className="text-center font-mono text-[10px] font-semibold text-zinc-300">
              {bin.count}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MultiRunComparison({
  runs,
  selectedIds,
  selectedRuns,
  onToggle,
}: {
  runs: BacktestRunListItem[];
  selectedIds: string[];
  selectedRuns: BacktestRunListItem[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h3 className="text-xs font-semibold text-zinc-300">
          Multi-run comparison
        </h3>
        <p className="mt-0.5 text-[9px] text-zinc-700">
          Select up to 3 persisted runs. Metrics are shown side-by-side without scoring or ranking.
        </p>
      </header>

      <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-800 p-2">
        {runs.length === 0 ? (
          <span className="px-1 py-1 text-[9px] text-zinc-700">
            No persisted runs yet.
          </span>
        ) : (
          runs.map((run) => {
            const selected = selectedIds.includes(run.id);
            const disabled = !selected && selectedIds.length >= 3;
            return (
              <button
                key={run.id}
                type="button"
                disabled={disabled}
                onClick={() => onToggle(run.id)}
                className={
                  "shrink-0 rounded border px-2 py-1.5 text-left text-[9px] transition-colors disabled:opacity-30 " +
                  (selected
                    ? "border-cyan-800 bg-cyan-950/25 text-cyan-300"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700")
                }
              >
                <span className="block max-w-36 truncate font-semibold">
                  {run.label || run.datasetId}
                </span>
                <span className="mt-0.5 block font-mono text-[8px] opacity-70">
                  N {run.sampleSize} · {signedPercent(run.netReturnPercent)}
                </span>
              </button>
            );
          })
        )}
      </div>

      {selectedRuns.length === 0 ? (
        <div className="px-3 py-5 text-center text-[10px] text-zinc-700">
          Select runs above to compare validation metrics.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[9px]">
            <thead className="bg-zinc-950/60 text-zinc-600">
              <tr>
                <th className="px-3 py-2">Run</th>
                <th className="px-3 py-2">N</th>
                <th className="px-3 py-2">Win</th>
                <th className="px-3 py-2">PF</th>
                <th className="px-3 py-2">E[R]</th>
                <th className="px-3 py-2">Avg R</th>
                <th className="px-3 py-2">Return</th>
                <th className="px-3 py-2">Max DD</th>
                <th className="px-3 py-2">Risk</th>
                <th className="px-3 py-2">Spread</th>
                <th className="px-3 py-2">Policy</th>
              </tr>
            </thead>
            <tbody>
              {selectedRuns.map((run) => (
                <tr key={run.id} className="border-t border-zinc-800 text-zinc-400">
                  <td className="max-w-44 truncate px-3 py-2 font-medium text-zinc-200">
                    {run.label || run.datasetId}
                  </td>
                  <td className="px-3 py-2 font-mono">{run.sampleSize}</td>
                  <td className="px-3 py-2 font-mono">{formatPercent(run.winRate)}</td>
                  <td className="px-3 py-2 font-mono">{formatNumber(run.profitFactor, 2)}</td>
                  <td className="px-3 py-2 font-mono">{formatSigned(run.expectancyR, 2)}</td>
                  <td className="px-3 py-2 font-mono">{formatSigned(run.averageR, 2)}</td>
                  <td className="px-3 py-2 font-mono">{signedPercent(run.netReturnPercent)}</td>
                  <td className="px-3 py-2 font-mono">{formatPercent(run.maxDrawdownPercent)}</td>
                  <td className="px-3 py-2 font-mono">{run.riskPercent.toFixed(2)}%</td>
                  <td className="px-3 py-2 font-mono">{run.assumedSpreadPips.toFixed(1)}</td>
                  <td className="px-3 py-2 font-mono">{run.intrabarConflictPolicy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ForwardComparisonPanel({
  comparison,
  loading,
  error,
  onCompare,
}: {
  comparison: HistoricalForwardComparison | null;
  loading: boolean;
  error: string | null;
  onCompare: () => Promise<void>;
}) {
  const rows = comparison
    ? [
        ["Sample size", comparison.historical.sampleSize, comparison.forward.sampleSize, comparison.delta.sampleSize],
        ["Win rate", comparison.historical.winRate, comparison.forward.winRate, comparison.delta.winRate],
        ["Profit factor", comparison.historical.profitFactor, comparison.forward.profitFactor, comparison.delta.profitFactor],
        ["Expectancy R", comparison.historical.expectancyR, comparison.forward.expectancyR, comparison.delta.expectancyR],
        ["Average R", comparison.historical.averageR, comparison.forward.averageR, comparison.delta.averageR],
        ["Max DD %", comparison.historical.maxDrawdownPercent, comparison.forward.maxDrawdownPercent, comparison.delta.maxDrawdownPercent],
        ["Net return %", comparison.historical.netReturnPercent, comparison.forward.netReturnPercent, comparison.delta.netReturnPercent],
      ]
    : [];

  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/25">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
        <div>
          <h3 className="text-xs font-semibold text-zinc-300">
            Historical vs forward paper
          </h3>
          <p className="mt-0.5 text-[9px] text-zinc-700">
            Reads the current Paper summary only when requested; no stores are merged.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void onCompare()}
          className="rounded border border-zinc-700 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-zinc-400 hover:border-emerald-800 hover:text-emerald-300 disabled:opacity-50"
        >
          {loading ? "Reading…" : "Compare with Paper"}
        </button>
      </header>

      {error && <div className="px-3 py-2 text-[9px] text-red-300">{error}</div>}

      {!comparison ? (
        <div className="px-3 py-5 text-center text-[10px] text-zinc-700">
          No forward comparison loaded.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[9px]">
            <thead className="bg-zinc-950/60 text-zinc-600">
              <tr>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2">Historical</th>
                <th className="px-3 py-2">Paper forward</th>
                <th className="px-3 py-2">Delta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, historical, forward, delta]) => (
                <tr key={String(label)} className="border-t border-zinc-800 text-zinc-400">
                  <td className="px-3 py-2 text-zinc-300">{label}</td>
                  <td className="px-3 py-2 font-mono">{formatGeneric(historical)}</td>
                  <td className="px-3 py-2 font-mono">{formatGeneric(forward)}</td>
                  <td className="px-3 py-2 font-mono">{formatGenericDelta(delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-zinc-800 px-3 py-2 text-[9px] leading-relaxed text-zinc-700">
            Delta is Paper minus Historical. It is descriptive only; different sample size, dates and market regimes can make direct interpretation unreliable.
          </p>
        </div>
      )}
    </section>
  );
}

function Context({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <dt className="uppercase tracking-[0.08em] text-zinc-700">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-zinc-400">{value}</dd>
    </div>
  );
}

function formatNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(2) + "%";
}

function signedPercent(value: number): string {
  return (value > 0 ? "+" : "") + value.toFixed(2) + "%";
}

function formatSigned(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(digits);
}

function shortDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function formatGeneric(value: string | number | null): string {
  if (value === null) return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return value.toFixed(2);
  }
  return value;
}

function formatGenericDelta(value: string | number | null): string {
  if (value === null) return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return (value > 0 ? "+" : "") + value.toFixed(2);
  }
  return value;
}
