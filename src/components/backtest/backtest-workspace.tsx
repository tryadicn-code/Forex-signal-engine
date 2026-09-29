"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BacktestRunArtifact, BacktestRunListItem } from "@/replay/backtest-run-types";
import type { HistoricalDatasetValidation } from "@/replay/import-types";

type ApiRunResponse =
  | { ok: true; artifact: BacktestRunArtifact }
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
  const [validation, setValidation] =
    useState<HistoricalDatasetValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<BacktestRunListItem[]>([]);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);

  const totalBytes = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  );

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

  const runBacktest = async () => {
    if (running || files.length === 0) return;
    setRunning(true);
    setError(null);
    setValidation(null);

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

      const response = await fetch("/api/backtest/run", {
        method: "POST",
        body: form,
        cache: "no-store",
      });
      const payload = (await response.json()) as ApiRunResponse;

      if (!response.ok || !payload.ok) {
        if (!payload.ok) {
          setError(payload.error);
          setValidation(payload.validation ?? null);
        } else {
          setError("Backtest request failed with HTTP " + response.status + ".");
        }
        return;
      }

      setArtifact(payload.artifact);
      setValidation(payload.artifact.validation);
      await refreshRecent();
    } catch (runError) {
      setError(
        runError instanceof Error ? runError.message : String(runError)
      );
    } finally {
      setRunning(false);
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

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-3 pb-20 sm:p-4 md:pb-4">
      <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
        <header className="border-b border-zinc-800 px-3 py-3">
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-cyan-400/80">
            Phase 5.4 · Historical Validation
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
                Historical backtest
              </h1>
              <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
                Import normalized MT5/CSV history, validate coverage, replay the existing FSE engine, and persist an isolated validation report.
              </p>
            </div>
            <Link
              href="/#overview"
              className="rounded border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              ← Live scanner
            </Link>
          </div>
        </header>

        <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="space-y-3">
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                1 · Historical files
              </h2>
              <label className="mt-2 block cursor-pointer rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 p-4 text-center transition-colors hover:border-emerald-800">
                <input
                  type="file"
                  multiple
                  accept=".csv,.txt,text/csv,text/plain"
                  className="sr-only"
                  onChange={(event) =>
                    setFiles(Array.from(event.target.files ?? []))
                  }
                />
                <span className="block text-sm font-medium text-zinc-200">
                  Select MT5 CSV/TXT files
                </span>
                <span className="mt-1 block text-[10px] leading-relaxed text-zinc-600">
                  File name must include symbol + timeframe, e.g. EURUSD_D1.csv, EURUSD_H4.csv, EURUSD_H1.csv, EURUSD_M15.csv.
                </span>
              </label>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                <span>{files.length} files</span>
                <span>{formatBytes(totalBytes)}</span>
                <span>D1 · H4 · H1 · M15 required per pair</span>
              </div>

              {files.length > 0 && (
                <div className="mt-2 max-h-28 overflow-auto rounded border border-zinc-800 bg-zinc-950/30 p-2">
                  <div className="grid gap-1 font-mono text-[9px] text-zinc-500 sm:grid-cols-2">
                    {files.map((file) => (
                      <div key={file.name} className="truncate">
                        {file.name} · {formatBytes(file.size)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="border-t border-zinc-800 pt-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                2 · Source normalization
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Field label="Dataset id">
                  <input
                    value={datasetId}
                    onChange={(event) => setDatasetId(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Source label">
                  <input
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Source UTC offset · minutes"
                  hint="120 = UTC+2, 180 = UTC+3. MT5 export often uses broker-server time."
                >
                  <input
                    type="number"
                    min={-840}
                    max={840}
                    step={30}
                    value={utcOffsetMinutes}
                    onChange={(event) => setUtcOffsetMinutes(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Assumed spread · pips"
                  hint="Deterministic static assumption; no random spread."
                >
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={spreadPips}
                    onChange={(event) => setSpreadPips(event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </section>

            <section className="border-t border-zinc-800 pt-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                3 · Replay window & risk
              </h2>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Start date" hint="Blank = common coverage start">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="End date" hint="Blank = common coverage end">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Initial balance">
                  <input
                    type="number"
                    min={1}
                    value={initialBalance}
                    onChange={(event) => setInitialBalance(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Risk / trade · %">
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    value={riskPercent}
                    onChange={(event) => setRiskPercent(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Max open positions">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxOpenPositions}
                    onChange={(event) => setMaxOpenPositions(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Max total risk · %">
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={maxTotalRisk}
                    onChange={(event) => setMaxTotalRisk(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Same-bar SL/TP"
                  hint="STOP_FIRST is the conservative default."
                >
                  <select
                    value={policy}
                    onChange={(event) => setPolicy(event.target.value)}
                    className={inputClass}
                  >
                    <option value="STOP_FIRST">STOP_FIRST</option>
                    <option value="TARGET_FIRST">TARGET_FIRST</option>
                    <option value="REJECT_AMBIGUOUS">REJECT_AMBIGUOUS</option>
                  </select>
                </Field>
              </div>
            </section>

            <div className="border-t border-zinc-800 pt-3">
              <button
                type="button"
                disabled={running || files.length === 0}
                onClick={runBacktest}
                className="w-full rounded-md border border-emerald-700/70 bg-emerald-950/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-emerald-300 transition-colors hover:bg-emerald-900/30 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                {running ? "Validating & replaying…" : "Validate & run backtest"}
              </button>
              <p className="mt-1.5 text-[9px] text-zinc-600">
                Synchronous safety limit: 50,000 M15 replay steps. Narrow the date range for larger datasets.
              </p>
            </div>
          </div>

          <RecentRuns
            runs={recentRuns}
            loadingRunId={loadingRunId}
            onLoad={loadPersistedRun}
          />
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-800/60 bg-red-950/20 px-3 py-2 text-xs text-red-200"
        >
          <span className="font-mono font-semibold">BACKTEST BLOCKED</span>
          <span className="ml-2 text-red-200/75">{error}</span>
        </div>
      )}

      {validation && <ValidationPanel validation={validation} />}

      {artifact && (
        <>
          <BacktestResultHeader artifact={artifact} onExport={exportReport} />
          <BacktestMetrics artifact={artifact} />
          <EquityCurve artifact={artifact} />
          <SegmentTable artifact={artifact} />
        </>
      )}
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded border border-zinc-800 bg-zinc-950/60 px-2.5 py-2 text-xs text-zinc-200 outline-none transition-colors focus:border-emerald-700 focus:ring-1 focus:ring-emerald-800";

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
    <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block text-[9px] font-normal normal-case tracking-normal text-zinc-700">
          {hint}
        </span>
      )}
    </label>
  );
}

function ValidationPanel({
  validation,
}: {
  validation: HistoricalDatasetValidation;
}) {
  const errors = validation.issues.filter((issue) => issue.severity === "ERROR");
  const warnings = validation.issues.filter(
    (issue) => issue.severity === "WARNING"
  );

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Dataset validation</h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {validation.importedFileCount} files · {validation.importedSymbolCount} symbols · {validation.importedSeriesCount} series
          </p>
        </div>
        <span
          className={
            "rounded border px-2 py-1 font-mono text-[9px] font-semibold " +
            (validation.valid
              ? "border-emerald-800 bg-emerald-950/30 text-emerald-300"
              : "border-red-800 bg-red-950/30 text-red-300")
          }
        >
          {validation.valid ? "VALID" : "BLOCKED"}
        </span>
      </header>

      <div className="grid gap-3 p-3 lg:grid-cols-[300px_minmax(0,1fr)]">
        <dl className="grid grid-cols-2 gap-2 text-[10px]">
          <DataItem label="UTC offset" value={formatOffset(validation.sourceUtcOffsetMinutes)} />
          <DataItem label="Spread" value={validation.assumedSpreadPips + " pips"} />
          <DataItem label="Common start" value={formatUtc(validation.commonStartAt)} />
          <DataItem label="Common end" value={formatUtc(validation.commonEndAt)} />
          <DataItem
            label="Est. M15 steps"
            value={
              validation.estimatedM15Steps === null
                ? "—"
                : validation.estimatedM15Steps.toLocaleString()
            }
          />
          <DataItem
            label="Issues"
            value={errors.length + " errors · " + warnings.length + " warnings"}
          />
        </dl>

        <div className="min-w-0">
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full min-w-[620px] text-left text-[10px]">
              <thead className="bg-zinc-950/70 text-zinc-600">
                <tr>
                  <th className="px-2 py-1.5">Series</th>
                  <th className="px-2 py-1.5">Candles</th>
                  <th className="px-2 py-1.5">Start</th>
                  <th className="px-2 py-1.5">End</th>
                  <th className="px-2 py-1.5">Gaps</th>
                </tr>
              </thead>
              <tbody>
                {validation.series.map((row) => (
                  <tr
                    key={row.symbol + row.timeframe}
                    className="border-t border-zinc-800 text-zinc-400"
                  >
                    <td className="px-2 py-1.5 font-mono text-zinc-200">
                      {row.symbol} · {row.timeframe}
                    </td>
                    <td className="px-2 py-1.5 font-mono">{row.candleCount.toLocaleString()}</td>
                    <td className="px-2 py-1.5 font-mono">{formatUtc(row.startAt)}</td>
                    <td className="px-2 py-1.5 font-mono">{formatUtc(row.endAt)}</td>
                    <td className="px-2 py-1.5 font-mono">{row.nonWeekendGapCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validation.issues.length > 0 && (
            <details className="mt-2 rounded border border-zinc-800 bg-zinc-950/30">
              <summary className="cursor-pointer px-2.5 py-2 text-[10px] font-medium text-zinc-400">
                Validation issues ({validation.issues.length})
              </summary>
              <div className="max-h-48 space-y-1 overflow-auto border-t border-zinc-800 p-2">
                {validation.issues.map((issue, index) => (
                  <div
                    key={issue.code + index}
                    className={
                      "text-[9px] leading-relaxed " +
                      (issue.severity === "ERROR"
                        ? "text-red-300"
                        : issue.severity === "WARNING"
                          ? "text-amber-300"
                          : "text-zinc-500")
                    }
                  >
                    <span className="font-mono font-semibold">{issue.severity} · {issue.code}</span>
                    {" · "}
                    {issue.message}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}

function BacktestResultHeader({
  artifact,
  onExport,
}: {
  artifact: BacktestRunArtifact;
  onExport: () => void;
}) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900/30 px-3 py-2.5">
      <div>
        <p className="font-mono text-[9px] text-zinc-600">{artifact.id}</p>
        <h2 className="mt-0.5 text-sm font-semibold text-zinc-100">
          Validation report
        </h2>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          {artifact.validation.symbols.join(", ")} · {formatUtc(artifact.config.startAt)} → {formatUtc(artifact.config.endAt)} · {(artifact.durationMs / 1000).toFixed(1)}s
        </p>
      </div>
      <button
        type="button"
        onClick={onExport}
        className="rounded border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-300 hover:border-emerald-800 hover:text-emerald-300"
      >
        Export JSON
      </button>
    </section>
  );
}

function BacktestMetrics({ artifact }: { artifact: BacktestRunArtifact }) {
  const analytics = artifact.analytics;
  const metrics = [
    ["Trades", analytics.sampleSize.toLocaleString()],
    ["Win rate", formatPercent(analytics.winRate)],
    ["Net return", signedPercent(analytics.netReturnPercent)],
    ["Profit factor", formatNumber(analytics.profitFactor, 2)],
    ["Expectancy R", formatSigned(analytics.expectancyR, 2)],
    ["Avg R", formatSigned(analytics.averageR, 2)],
    ["Max equity DD", formatPercent(analytics.maxEquityDrawdownPercent)],
    ["Net P/L", formatSigned(analytics.netPnL, 2)],
  ];

  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-800 bg-zinc-800 sm:grid-cols-4 xl:grid-cols-8">
      {metrics.map(([label, value]) => (
        <div key={label} className="bg-[#0f131b] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-[0.1em] text-zinc-600">
            {label}
          </div>
          <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-zinc-200">
            {value}
          </div>
        </div>
      ))}
    </section>
  );
}

function EquityCurve({ artifact }: { artifact: BacktestRunArtifact }) {
  const points = artifact.analytics.equityCurve;
  if (points.length < 2) {
    return (
      <section className="rounded-md border border-zinc-800 bg-zinc-900/30 p-3 text-xs text-zinc-600">
        Equity curve needs at least two replay marks.
      </section>
    );
  }

  const width = 1000;
  const height = 220;
  const pad = 12;
  const values = points.map((point) => point.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-9, max - min);
  const firstAt = points[0].asOf;
  const lastAt = points[points.length - 1].asOf;
  const timeRange = Math.max(1, lastAt - firstAt);

  const path = points
    .map((point, index) => {
      const x =
        pad + ((point.asOf - firstAt) / timeRange) * (width - pad * 2);
      const y =
        height -
        pad -
        ((point.equity - min) / range) * (height - pad * 2);
      return (index === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Equity curve</h2>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Mark-to-market replay equity · includes floating P/L
          </p>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">
          {formatNumber(min, 2)} → {formatNumber(max, 2)}
        </span>
      </header>
      <div className="overflow-hidden p-2">
        <svg
          viewBox={"0 0 " + width + " " + height}
          role="img"
          aria-label="Historical mark-to-market equity curve"
          className="h-48 w-full"
          preserveAspectRatio="none"
        >
          <line
            x1={pad}
            y1={height / 2}
            x2={width - pad}
            y2={height / 2}
            stroke="rgb(63 63 70)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke="rgb(52 211 153)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </section>
  );
}

function SegmentTable({ artifact }: { artifact: BacktestRunArtifact }) {
  const rows = artifact.analytics.segments.bySymbol;
  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="border-b border-zinc-800 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-zinc-100">Performance by pair</h2>
        <p className="mt-0.5 text-[10px] text-zinc-600">
          Sample size remains visible so small groups are not mistaken for robust conclusions.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[10px]">
          <thead className="bg-zinc-950/60 text-zinc-600">
            <tr>
              <th className="px-3 py-2">Pair</th>
              <th className="px-3 py-2">N</th>
              <th className="px-3 py-2">Win rate</th>
              <th className="px-3 py-2">Net R</th>
              <th className="px-3 py-2">Avg R</th>
              <th className="px-3 py-2">PF</th>
              <th className="px-3 py-2">Net P/L</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-zinc-600">
                  No closed historical trades in this run.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-t border-zinc-800 text-zinc-400">
                  <td className="px-3 py-2 font-mono font-semibold text-zinc-200">{row.label}</td>
                  <td className="px-3 py-2 font-mono">{row.sampleSize}</td>
                  <td className="px-3 py-2 font-mono">{formatPercent(row.winRate)}</td>
                  <td className="px-3 py-2 font-mono">{formatSigned(row.netR, 2)}</td>
                  <td className="px-3 py-2 font-mono">{formatSigned(row.averageR, 2)}</td>
                  <td className="px-3 py-2 font-mono">{formatNumber(row.profitFactor, 2)}</td>
                  <td className="px-3 py-2 font-mono">{formatSigned(row.netPnL, 2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentRuns({
  runs,
  loadingRunId,
  onLoad,
}: {
  runs: BacktestRunListItem[];
  loadingRunId: string | null;
  onLoad: (id: string) => void;
}) {
  return (
    <aside className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/30">
      <header className="border-b border-zinc-800 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
          Recent reports
        </h2>
        <p className="mt-0.5 text-[9px] text-zinc-700">
          Persisted separately under .data/backtest-runs
        </p>
      </header>
      <div className="max-h-[430px] space-y-1.5 overflow-auto p-2">
        {runs.length === 0 ? (
          <div className="px-2 py-6 text-center text-[10px] text-zinc-700">
            No persisted backtest reports yet.
          </div>
        ) : (
          runs.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onLoad(run.id)}
              disabled={loadingRunId !== null}
              className="w-full rounded border border-zinc-800 bg-zinc-900/30 p-2 text-left hover:border-zinc-700 hover:bg-zinc-900/60 disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] font-semibold text-zinc-300">
                  {run.datasetId}
                </span>
                <span className="shrink-0 font-mono text-[9px] text-zinc-600">
                  N {run.sampleSize}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-zinc-600">
                <span>{run.symbols.join(", ")}</span>
                <span>{signedPercent(run.netReturnPercent)}</span>
                <span>DD {formatPercent(run.maxDrawdownPercent)}</span>
                <span>E[R] {formatSigned(run.expectancyR, 2)}</span>
              </div>
              <div className="mt-1 font-mono text-[8px] text-zinc-700">
                {loadingRunId === run.id ? "Loading…" : formatUtc(run.completedAt)}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function DataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/30 px-2 py-1.5">
      <dt className="text-[8px] uppercase tracking-[0.1em] text-zinc-700">{label}</dt>
      <dd className="mt-0.5 font-mono text-[10px] text-zinc-300">{value}</dd>
    </div>
  );
}

function formatUtc(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  return "UTC" + sign + hours + (mins ? ":" + String(mins).padStart(2, "0") : "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(2) + "%";
}

function signedPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(2) + "%";
}

function formatSigned(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(digits);
}
