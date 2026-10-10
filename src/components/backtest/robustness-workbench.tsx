"use client";

import { useMemo, useState } from "react";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import {
  buildBacktestReproducibilityFingerprint,
  calculateSequentialValidation,
  calculateTemporalHoldout,
} from "@/replay/robustness-validation";
import {
  formatNumber,
  formatPercent,
  formatSigned,
} from "@/lib/backtest-format";
import { SPLITS } from "./robustness-workbench/lib/constants";
import { Diagnostic } from "./robustness-workbench/components/diagnostic";
import { Fingerprint } from "./robustness-workbench/components/fingerprint";
import { TemporalHoldoutPanel } from "./robustness-workbench/components/temporal-holdout-panel";
import { SequentialPanel } from "./robustness-workbench/components/sequential-panel";

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