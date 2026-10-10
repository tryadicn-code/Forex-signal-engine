"use client";

import { useMemo, useState } from "react";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  buildBacktestReproducibilityFingerprint,
  calculateSequentialValidation,
  calculateTemporalHoldout,
} from "@/replay/robustness-validation";
import type { RobustnessPeriodMetrics } from "@/replay/robustness-types";

const SPLITS = [
  { value: 0.6, label: "60 / 40" },
  { value: 0.7, label: "70 / 30" },
  { value: 0.8, label: "80 / 20" },
] as const;

export function RobustnessWorkbench({
  artifact,
}: {
  artifact: BacktestRunArtifact;
}) {
  const [splitRatio, setSplitRatio] = useState(0.7);
  const [foldCount, setFoldCount] = useState(4);

  const holdout = useMemo(
    () => calculateTemporalHoldout(artifact, splitRatio),
    [artifact, splitRatio]
  );
  const sequential = useMemo(
    () => calculateSequentialValidation(artifact, foldCount),
    [artifact, foldCount]
  );
  const fingerprint = useMemo(
    () => buildBacktestReproducibilityFingerprint(artifact),
    [artifact]
  );

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-violet-400/80">
            Phase 5.6
          </p>
          <h3 className="mt-0.5 text-xs font-semibold text-zinc-300">
            Robustness & out-of-sample
          </h3>
          <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
            Time-based holdout and expanding-window validation for the fixed strategy. No parameter optimization or strategy selection is performed here.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            IS / OOS
            <select
              value={splitRatio}
              onChange={(event) => setSplitRatio(Number(event.target.value))}
              className="mt-1 block rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-400 outline-none focus:border-violet-800"
            >
              {SPLITS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            Folds
            <select
              value={foldCount}
              onChange={(event) => setFoldCount(Number(event.target.value))}
              className="mt-1 block rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-400 outline-none focus:border-violet-800"
            >
              {[2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <TemporalHoldoutPanel holdout={holdout} />
          <SequentialPanel sequential={sequential} />
        </div>

        <aside className="space-y-3">
          <section className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-600">
              Sequential diagnostics
            </h4>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <Diagnostic
                label="Folds w/ trades"
                value={
                  sequential.diagnostics.foldsWithTrades +
                  " / " +
                  sequential.diagnostics.foldCount
                }
              />
              <Diagnostic
                label="Empty folds"
                value={String(sequential.diagnostics.emptyFolds)}
              />
              <Diagnostic
                label="Positive E[R]"
                value={String(sequential.diagnostics.positiveExpectancyFolds)}
              />
              <Diagnostic
                label="Non-positive E[R]"
                value={String(sequential.diagnostics.nonPositiveExpectancyFolds)}
              />
              <Diagnostic
                label="Mean E[R]"
                value={formatSigned(
                  sequential.diagnostics.expectancyRMean,
                  2
                )}
              />
              <Diagnostic
                label="E[R] stdev"
                value={formatNumber(
                  sequential.diagnostics.expectancyRStandardDeviation,
                  2
                )}
              />
              <Diagnostic
                label="Win-rate stdev"
                value={formatPercent(
                  sequential.diagnostics.winRateStandardDeviation
                )}
              />
              <Diagnostic
                label="Validation trades"
                value={String(sequential.diagnostics.validationTradeCount)}
              />
            </dl>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              These are descriptive stability diagnostics. Empty or small folds weaken the evidence and are kept visible instead of being silently excluded.
            </p>
          </section>

          <section className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-600">
              Reproducibility fingerprint
            </h4>
            <div className="mt-2 space-y-2 font-mono text-[11px]">
              <Fingerprint label="Assumptions" value={fingerprint.assumptions} />
              <Fingerprint label="Outcomes" value={fingerprint.outcomes} />
              <Fingerprint label="Combined" value={fingerprint.combined} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              {fingerprint.protocolVersion} · {fingerprint.algorithm}. Deterministic comparison fingerprint only; not a cryptographic security hash.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}

function TemporalHoldoutPanel({
  holdout,
}: {
  holdout: ReturnType<typeof calculateTemporalHoldout>;
}) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/40">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h4 className="text-[11px] font-semibold text-zinc-400">
          Temporal holdout
        </h4>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Split at {formatUtc(holdout.splitAt)}. Trades are assigned by entry time, not close time.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-[11px]">
          <thead className="bg-zinc-950/60 text-zinc-500">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Window</th>
              <th className="px-3 py-2">N</th>
              <th className="px-3 py-2">Win</th>
              <th className="px-3 py-2">PF</th>
              <th className="px-3 py-2">E[R]</th>
              <th className="px-3 py-2">Avg R</th>
              <th className="px-3 py-2">Net R</th>
              <th className="px-3 py-2">Max L streak</th>
            </tr>
          </thead>
          <tbody>
            <PeriodRow
              label="In-sample"
              startAt={holdout.inSample.startAt}
              endAt={holdout.inSample.endAt}
              metrics={holdout.inSample.metrics}
            />
            <PeriodRow
              label="Out-of-sample"
              startAt={holdout.outOfSample.startAt}
              endAt={holdout.outOfSample.endAt}
              metrics={holdout.outOfSample.metrics}
            />
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 gap-px border-t border-zinc-800 bg-zinc-800">
        <Delta label="Δ Win rate" value={formatSignedPercent(holdout.delta.winRate)} />
        <Delta label="Δ E[R]" value={formatSigned(holdout.delta.expectancyR, 2)} />
        <Delta label="Δ Avg R" value={formatSigned(holdout.delta.averageR, 2)} />
      </div>
    </section>
  );
}

function SequentialPanel({
  sequential,
}: {
  sequential: ReturnType<typeof calculateSequentialValidation>;
}) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/40">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h4 className="text-[11px] font-semibold text-zinc-400">
          Expanding-window sequential validation
        </h4>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Each fold expands development history, then measures the next untouched time window.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[11px]">
          <thead className="bg-zinc-950/60 text-zinc-500">
            <tr>
              <th className="px-3 py-2">Fold</th>
              <th className="px-3 py-2">Validation window</th>
              <th className="px-3 py-2">Dev N</th>
              <th className="px-3 py-2">OOS N</th>
              <th className="px-3 py-2">OOS Win</th>
              <th className="px-3 py-2">OOS PF</th>
              <th className="px-3 py-2">OOS E[R]</th>
              <th className="px-3 py-2">OOS Net R</th>
            </tr>
          </thead>
          <tbody>
            {sequential.folds.map((fold) => (
              <tr
                key={fold.index}
                className="border-t border-zinc-800 text-zinc-500"
              >
                <td className="px-3 py-2 font-mono text-zinc-300">
                  {fold.index}
                </td>
                <td className="px-3 py-2 font-mono">
                  {shortDate(fold.validationStartAt)} → {shortDate(fold.validationEndAt)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {fold.development.sampleSize}
                </td>
                <td className="px-3 py-2 font-mono">
                  {fold.validation.sampleSize}
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatPercent(fold.validation.winRate)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatNumber(fold.validation.profitFactor, 2)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatSigned(fold.validation.expectancyR, 2)}
                </td>
                <td className="px-3 py-2 font-mono">
                  {formatSigned(fold.validation.netR, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PeriodRow({
  label,
  startAt,
  endAt,
  metrics,
}: {
  label: string;
  startAt: number;
  endAt: number;
  metrics: RobustnessPeriodMetrics;
}) {
  return (
    <tr className="border-t border-zinc-800 text-zinc-500">
      <td className="px-3 py-2 font-medium text-zinc-300">{label}</td>
      <td className="px-3 py-2 font-mono">
        {shortDate(startAt)} → {shortDate(endAt)}
      </td>
      <td className="px-3 py-2 font-mono">{metrics.sampleSize}</td>
      <td className="px-3 py-2 font-mono">{formatPercent(metrics.winRate)}</td>
      <td className="px-3 py-2 font-mono">
        {formatNumber(metrics.profitFactor, 2)}
      </td>
      <td className="px-3 py-2 font-mono">
        {formatSigned(metrics.expectancyR, 2)}
      </td>
      <td className="px-3 py-2 font-mono">
        {formatSigned(metrics.averageR, 2)}
      </td>
      <td className="px-3 py-2 font-mono">
        {formatSigned(metrics.netR, 2)}
      </td>
      <td className="px-3 py-2 font-mono">
        {metrics.maxConsecutiveLosses}
      </td>
    </tr>
  );
}

function Delta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950/50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[11px] font-semibold text-zinc-400">
        {value}
      </div>
    </div>
  );
}

function Diagnostic({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <dt className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-[11px] text-zinc-400">{value}</dd>
    </div>
  );
}

function Fingerprint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 break-all text-zinc-400">{value}</div>
    </div>
  );
}

function formatNumber(value: number | null, digits: number): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : value.toFixed(2) + "%";
}

function formatSignedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(2) + "pp";
}

function formatSigned(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return (value > 0 ? "+" : "") + value.toFixed(digits);
}

function shortDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function formatUtc(value: number): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
