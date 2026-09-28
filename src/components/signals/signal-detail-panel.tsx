"use client";

import { useEffect } from "react";
import {
  BiasBadge,
  DecisionBadge,
  DirectionBadge,
  FreshnessBadge,
  StateBadge,
} from "@/components/common/badges";
import { ConflictList } from "@/components/signals/conflict-list";
import { EvidenceList } from "@/components/signals/evidence-list";
import { MtfContext } from "@/components/signals/mtf-context";
import { SignalLifecycle } from "@/components/signals/signal-lifecycle";
import { TransitionHistory } from "@/components/signals/transition-history";
import {
  formatFixed,
  formatPips,
  formatPrice,
  formatRatio,
  formatTime,
  NOT_AVAILABLE,
} from "@/lib/format";
import type { SignalView } from "@/scanner/scanner-api";
import type { SymbolScanResult } from "@/scanner/scanner-result";
import type { SignalStateTransition } from "@/types/market-data";
import { cn } from "@/lib/utils";

export function SignalDetailPanel({
  result,
  signal,
  transitions,
  onClose,
}: {
  result: SymbolScanResult | null;
  signal: SignalView | null;
  transitions: SignalStateTransition[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!result) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [result, onClose]);

  if (!result) {
    return (
      <aside
        aria-label="Signal detail"
        className="hidden rounded border border-zinc-800 bg-zinc-900/30 p-6 xl:block"
      >
        <div className="flex min-h-72 flex-col items-center justify-center text-center">
          <span aria-hidden="true" className="text-2xl text-zinc-700">◇</span>
          <h2 className="mt-2 text-sm font-semibold text-zinc-300">Select a symbol</h2>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-600">
            Choose a scanner row to inspect the engine evidence, conflicts, lifecycle,
            risk, execution gates, and multi-timeframe context.
          </p>
        </div>
      </aside>
    );
  }

  const failed = result.status !== "ANALYSED";
  const detailLabel = "Signal detail for " + result.symbol;

  return (
    <aside
      role="complementary"
      aria-label={detailLabel}
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-[#0b0e14] shadow-2xl",
        "xl:sticky xl:top-16 xl:z-0 xl:max-h-[calc(100vh-5rem)] xl:rounded xl:border xl:border-zinc-800 xl:bg-zinc-900/30 xl:shadow-none"
      )}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-800 bg-[#0b0e14]/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur xl:bg-zinc-900/95 xl:pt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-base font-semibold tracking-wide text-zinc-100">
              {result.symbol}
            </h2>
            <DirectionBadge direction={result.biasDirection} />
            <FreshnessBadge status={result.freshness} />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{result.reason}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close signal detail"
          className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          Close
        </button>
      </header>

      <div className="space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {failed ? (
          <FailureDetail result={result} />
        ) : (
          <>
            <section aria-labelledby="decision-title">
              <SectionTitle id="decision-title">Decision</SectionTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                <DecisionBadge decision={result.executionDecision} />
                <StateBadge state={result.signalState} />
                <BiasBadge bias={result.bias} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-zinc-800 bg-zinc-800 sm:grid-cols-3">
                <Metric label="Price" value={formatPrice(result.symbol, result.latestPrice)} />
                <Metric
                  label="Spread"
                  value={
                    result.spreadPips === null
                      ? NOT_AVAILABLE
                      : formatPips(result.spreadPips) + " pips"
                  }
                />
                <Metric label="R:R" value={formatRatio(result.riskReward)} />
                <Metric label="Bias score" value={formatFixed(result.biasScore, 0)} />
                <Metric label="Setup score" value={formatFixed(result.setupScore, 0)} />
                <Metric label="Position size" value={formatFixed(result.positionSize, 2)} />
              </dl>
            </section>

            <section aria-labelledby="mtf-title">
              <SectionTitle id="mtf-title">Multi-timeframe context</SectionTitle>
              <div className="mt-2">
                <MtfContext timeframes={result.timeframes} />
              </div>
            </section>

            <section aria-labelledby="lifecycle-title">
              <SectionTitle id="lifecycle-title">Signal lifecycle</SectionTitle>
              <div className="mt-2">
                <SignalLifecycle state={result.signalState} />
              </div>
              {signal && (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <SmallDatum label="Origin timeframe" value={signal.originTimeframe} />
                  <SmallDatum label="Origin time" value={formatTime(signal.originTimestamp)} />
                  <SmallDatum label="Created" value={formatTime(signal.createdAt)} />
                  <SmallDatum
                    label="Transitions"
                    value={String(signal.transitionCount)}
                  />
                </dl>
              )}
              <div className="mt-3">
                <TransitionHistory transitions={transitions} />
              </div>
            </section>

            <section aria-labelledby="execution-title">
              <SectionTitle id="execution-title">Execution gates</SectionTitle>
              <ExecutionDetail result={result} />
            </section>

            <section aria-labelledby="risk-title">
              <SectionTitle id="risk-title">Risk</SectionTitle>
              <RiskDetail result={result} />
            </section>

            <section aria-labelledby="explain-title">
              <SectionTitle id="explain-title">Explainability</SectionTitle>
              <div className="mt-2 grid gap-3 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div>
                  <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Evidence
                  </h3>
                  <EvidenceList evidence={result.evidence} />
                </div>
                <div>
                  <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Conflicts
                  </h3>
                  <ConflictList conflicts={result.conflicts} />
                </div>
              </div>
            </section>

            <DataQuality result={result} />
          </>
        )}
      </div>
    </aside>
  );
}

function ExecutionDetail({ result }: { result: SymbolScanResult }) {
  const detail = result.executionDetail;
  if (!detail) {
    return <p className="mt-2 text-xs text-zinc-600">Execution was not evaluated.</p>;
  }

  return (
    <div className="mt-2 space-y-3">
      <ul className="space-y-1">
        {detail.conditions.map((condition) => (
          <li
            key={condition.name}
            className="flex gap-2 rounded border border-zinc-800 bg-zinc-900/30 px-2.5 py-2"
          >
            <span
              aria-hidden="true"
              className={condition.passed ? "text-emerald-400" : "text-orange-400"}
            >
              {condition.passed ? "✓" : "✕"}
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[11px] text-zinc-200">{condition.name}</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                {condition.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {detail.triggeredVetoes.length > 0 && (
        <div className="rounded border border-orange-700/40 bg-orange-950/20 px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-orange-300">
            Hard vetoes
          </div>
          <ul className="mt-1 space-y-1 font-mono text-[11px] text-orange-200/80">
            {detail.triggeredVetoes.map((veto) => (
              <li key={veto}>✕ {veto}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Engine reasons
        </div>
        {detail.reasons.length > 0 ? (
          <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-zinc-400">
            {detail.reasons.map((reason, index) => (
              <li key={reason + index} className="flex gap-2">
                <span aria-hidden="true" className="text-zinc-600">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-zinc-600">No execution reasons recorded.</p>
        )}
      </div>
    </div>
  );
}

function RiskDetail({ result }: { result: SymbolScanResult }) {
  const risk = result.riskDetail;
  if (!risk) {
    return <p className="mt-2 text-xs text-zinc-600">Risk was not evaluated.</p>;
  }

  return (
    <div className="mt-2">
      <div
        className={cn(
          "mb-2 rounded border px-2.5 py-2 text-xs",
          risk.approved
            ? "border-emerald-700/40 bg-emerald-950/20 text-emerald-200"
            : "border-orange-700/40 bg-orange-950/20 text-orange-200"
        )}
      >
        <span className="font-mono font-semibold">
          {risk.approved ? "✓ RISK APPROVED" : "✕ RISK REJECTED"}
        </span>
        {risk.rejectionReason && (
          <p className="mt-1 text-[11px] opacity-75">{risk.rejectionReason}</p>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded border border-zinc-800 bg-zinc-800">
        <Metric
          label="Stop distance"
          value={
            risk.stopDistancePips === null
              ? NOT_AVAILABLE
              : formatPips(risk.stopDistancePips) + " pips"
          }
        />
        <Metric label="TP1" value={formatPrice(result.symbol, risk.takeProfit1)} />
        <Metric label="TP2" value={formatPrice(result.symbol, risk.takeProfit2)} />
      </dl>
    </div>
  );
}

function DataQuality({ result }: { result: SymbolScanResult }) {
  if (result.issues.length === 0 && result.errors.length === 0) return null;

  return (
    <section aria-labelledby="data-quality-title">
      <SectionTitle id="data-quality-title">Data quality</SectionTitle>
      <div className="mt-2 space-y-1.5">
        {result.issues.map((issue, index) => (
          <div
            key={issue.code + index}
            className="rounded border border-amber-700/40 bg-amber-950/15 px-2.5 py-2"
          >
            <div className="font-mono text-[11px] text-amber-300">{issue.code}</div>
            <p className="mt-0.5 text-[11px] text-amber-200/60">{issue.message}</p>
          </div>
        ))}
        {result.errors.map((error, index) => (
          <div
            key={error + index}
            className="rounded border border-orange-700/40 bg-orange-950/20 px-2.5 py-2 font-mono text-[11px] text-orange-200/80"
          >
            {error}
          </div>
        ))}
      </div>
    </section>
  );
}

function FailureDetail({ result }: { result: SymbolScanResult }) {
  return (
    <section aria-labelledby="failure-title">
      <SectionTitle id="failure-title">Symbol failure</SectionTitle>
      <div className="mt-2 rounded border border-orange-700/50 bg-orange-950/20 p-3">
        <div className="font-mono text-xs font-semibold text-orange-300">
          {result.status.replaceAll("_", " ")}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-orange-200/70">{result.reason}</p>
      </div>
      <DataQuality result={result} />
    </section>
  );
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
      {children}
    </h3>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0b0e14] px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs tabular-nums text-zinc-200">{value}</dd>
    </div>
  );
}

function SmallDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/30 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</dt>
      <dd className="mt-0.5 break-words font-mono text-[11px] text-zinc-300">{value}</dd>
    </div>
  );
}
