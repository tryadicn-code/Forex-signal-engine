"use client";

import { useMemo } from "react";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  buildValidationSummary,
  calculateBacktestStatisticalDiagnostics,
} from "@/replay/statistical-diagnostics";
import {
  formatNumber,
  formatPercent,
  formatSigned,
} from "@/lib/backtest-format";

export function StatisticalDiagnosticsWorkbench({
  artifact,
}: {
  artifact: BacktestRunArtifact;
}) {
  const diagnostics = useMemo(
    () => calculateBacktestStatisticalDiagnostics(artifact),
    [artifact]
  );
  const summary = useMemo(
    () => buildValidationSummary(artifact, diagnostics),
    [artifact, diagnostics]
  );

  const exportSummary = () => {
    const blob = new Blob([JSON.stringify(summary, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.id + "-validation-summary.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const win = diagnostics.winRateWilson95;
  const bootstrap = diagnostics.expectancyRBootstrap95;
  const monteCarlo = diagnostics.tradeOrderMonteCarlo;

  return (
    <section className="rounded-md border border-zinc-800 bg-zinc-900/30">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-amber-400/80">
            Phase 5.7
          </p>
          <h3 className="mt-0.5 text-xs font-semibold text-zinc-300">
            Statistical diagnostics
          </h3>
          <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
            Confidence intervals and deterministic resampling quantify uncertainty in the observed historical sample. They do not guarantee future performance.
          </p>
        </div>
        <button
          type="button"
          onClick={exportSummary}
          className="rounded border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 hover:border-amber-800 hover:text-amber-300"
        >
          Export validation summary
        </button>
      </header>

      {diagnostics.sampleWarnings.length > 0 && (
        <div className="space-y-1.5 border-b border-zinc-800 p-3">
          {diagnostics.sampleWarnings.map((warning) => (
            <div
              key={warning.code}
              className={
                "rounded border px-2.5 py-2 text-[11px] leading-relaxed " +
                (warning.severity === "WARNING"
                  ? "border-amber-900/70 bg-amber-950/20 text-amber-300"
                  : "border-zinc-800 bg-zinc-950/40 text-zinc-500")
              }
            >
              <span className="font-mono font-semibold">
                {warning.code}
              </span>
              <span className="ml-2">{warning.message}</span>
              <span className="ml-2 font-mono opacity-70">
                N={warning.sampleSize} · workflow reference ≥{warning.suggestedMinimum}
              </span>
            </div>
          ))}
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Sample thresholds are workflow warnings for review consistency, not universal statistical standards.
          </p>
        </div>
      )}

      <div className="grid gap-3 p-3 lg:grid-cols-3">
        <DiagnosticCard
          title="Win-rate uncertainty"
          subtitle="95% Wilson interval"
          primary={win ? formatPercent(win.estimate) : "—"}
          rows={
            win
              ? [
                  ["Lower", formatPercent(win.lower)],
                  ["Upper", formatPercent(win.upper)],
                  ["Sample", String(diagnostics.sampleSize)],
                ]
              : [["Status", "No closed trades"]]
          }
          note="Wilson interval is used instead of a normal approximation because it behaves better for small samples and extreme win rates."
        />

        <DiagnosticCard
          title="Expectancy R uncertainty"
          subtitle="Deterministic bootstrap · 95%"
          primary={
            bootstrap
              ? formatSigned(bootstrap.interval.estimate, 2) + "R"
              : "—"
          }
          rows={
            bootstrap
              ? [
                  ["Lower", formatSigned(bootstrap.interval.lower, 2) + "R"],
                  ["Upper", formatSigned(bootstrap.interval.upper, 2) + "R"],
                  ["Resamples", bootstrap.iterations.toLocaleString()],
                  [
                    "Positive mean-R resamples",
                    (bootstrap.positiveResampleFraction * 100).toFixed(1) + "%",
                  ],
                ]
              : [["Status", "No closed trades"]]
          }
          note="Positive resample fraction describes the bootstrap samples only; it is not a probability forecast of future profitability."
        />

        <DiagnosticCard
          title="Trade-order path risk"
          subtitle="Deterministic Monte Carlo shuffle"
          primary={
            monteCarlo
              ? formatNumber(monteCarlo.p95MaxDrawdownR, 2) + "R"
              : "—"
          }
          rows={
            monteCarlo
              ? [
                  [
                    "Observed max DD",
                    formatNumber(monteCarlo.observedMaxDrawdownR, 2) + "R",
                  ],
                  [
                    "Median shuffled DD",
                    formatNumber(monteCarlo.medianMaxDrawdownR, 2) + "R",
                  ],
                  [
                    "P99 shuffled DD",
                    formatNumber(monteCarlo.p99MaxDrawdownR, 2) + "R",
                  ],
                  [
                    "Worst simulated",
                    formatNumber(monteCarlo.worstMaxDrawdownR, 2) + "R",
                  ],
                  ["Shuffles", monteCarlo.iterations.toLocaleString()],
                ]
              : [["Status", "No closed trades"]]
          }
          note="The same realized R outcomes are shuffled without replacement. Net R is unchanged; only path-dependent drawdown changes."
        />
      </div>

      <div className="border-t border-zinc-800 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
        Phase 5.7 is descriptive validation only. Bootstrap and Monte Carlo reuse the observed historical outcomes and cannot correct regime mismatch, data bias, execution-model error, or strategy-selection bias.
      </div>
    </section>
  );
}

function DiagnosticCard({
  title,
  subtitle,
  primary,
  rows,
  note,
}: {
  title: string;
  subtitle: string;
  primary: string;
  rows: Array<[string, string]>;
  note: string;
}) {
  return (
    <article className="rounded border border-zinc-800 bg-zinc-950/60">
      <header className="border-b border-zinc-800 px-3 py-2">
        <h4 className="text-[11px] font-semibold text-zinc-400">{title}</h4>
        <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
        <div className="mt-2 font-mono text-lg font-semibold tabular-nums text-zinc-200">
          {primary}
        </div>
      </header>
      <dl className="divide-y divide-zinc-800">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 px-3 py-1.5"
          >
            <dt className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
              {label}
            </dt>
            <dd className="font-mono text-[11px] text-zinc-400">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-zinc-800 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
        {note}
      </p>
    </article>
  );
}


