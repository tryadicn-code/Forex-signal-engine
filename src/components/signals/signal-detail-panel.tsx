"use client";

import { useEffect } from "react";
import {
  Badge,
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
import { PriceChart } from "@/components/signals/price-chart";
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
import type { PaperDashboardData } from "@/paper/types";
import { cn } from "@/lib/utils";

export function SignalDetailPanel({
  result,
  signal,
  transitions,
  paper,
  onRefresh,
  refreshing = false,
  onClose,
}: {
  result: SymbolScanResult | null;
  signal: SignalView | null;
  transitions: SignalStateTransition[];
  paper?: PaperDashboardData;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
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
        "fixed inset-x-0 bottom-0 top-12 z-40 overflow-y-auto border-t border-zinc-700 bg-[#0b0e14] shadow-2xl",
        "xl:sticky xl:top-16 xl:z-0 xl:max-h-[calc(100vh-5rem)] xl:rounded xl:border xl:border-zinc-800 xl:bg-zinc-900/30 xl:shadow-none"
      )}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-800 bg-[#0b0e14]/95 px-4 py-3 backdrop-blur xl:bg-zinc-900/95">
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

      <div className="space-y-4 p-4">
        {failed ? (
          <FailureDetail result={result} />
        ) : (
          <>
            <section aria-labelledby="price-chart-title">
              <SectionTitle id="price-chart-title">Price chart</SectionTitle>
              <div className="mt-2">
                <PriceChart symbol={result.symbol} asOf={result.updatedAt} />
              </div>
            </section>

            <section aria-labelledby="decision-title">
              <SectionTitle id="decision-title">Decision state</SectionTitle>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <DecisionDatum
                  label="Engine decision"
                  value={<DecisionBadge decision={result.executionDecision} />}
                />
                <DecisionDatum
                  label="Signal lifecycle"
                  value={<StateBadge state={result.signalState} />}
                />
                <DecisionDatum
                  label="Bias"
                  value={<BiasBadge bias={result.bias} />}
                  className="col-span-2 sm:col-span-1"
                />
              </div>
              {result.executionDecision === "EXECUTE" &&
                result.signalState !== "EXECUTE" && (
                  <div
                    role="status"
                    className="mt-2 rounded border border-amber-700/50 bg-amber-950/20 px-3 py-2"
                  >
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                      Engine / lifecycle mismatch
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-200/70">
                      The engine currently says EXECUTE, but this signal lifecycle is{" "}
                      <span className="font-mono font-semibold">
                        {result.signalState ?? "not executable"}
                      </span>
                      . Paper Trading will not open a position unless both are executable.
                    </p>
                  </div>
                )}
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

            <PaperExecutionDetail
              result={result}
              paper={paper}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />

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

function PaperExecutionDetail({
  result,
  paper,
  onRefresh,
  refreshing,
}: {
  result: SymbolScanResult;
  paper?: PaperDashboardData;
  onRefresh?: () => Promise<void>;
  refreshing: boolean;
}) {
  if (!result.signalId) return null;

  const order = paper?.recentOrders.find((item) => item.signalId === result.signalId) ?? null;
  const position = paper?.openPositions.find((item) => item.signalId === result.signalId) ?? null;
  const trade = paper?.recentTrades.find((item) => item.signalId === result.signalId) ?? null;

  let label = "NO PAPER ACTION";
  let tone = "muted";
  let note = "This signal has not produced a paper execution.";
  let glyph = "◌";

  if (position) {
    label = "PAPER OPEN";
    tone = "bullish";
    glyph = "●";
    note = `Paper position is open from ${formatPrice(result.symbol, position.entryPrice)}.`;
  } else if (trade) {
    label = "PAPER CLOSED";
    tone = trade.realizedPnL >= 0 ? "bullish" : "danger";
    glyph = "■";
    note = `Closed ${trade.closeReason} at ${formatPrice(result.symbol, trade.exitPrice)} · ${trade.realizedR >= 0 ? "+" : ""}${trade.realizedR.toFixed(2)}R.`;
  } else if (order?.status === "REJECTED") {
    label = "PAPER REJECTED";
    tone = "danger";
    glyph = "✕";
    note = paperRejectionMessage(order.rejectionReason, result);
  } else if (order?.status === "FILLED") {
    label = "PAPER FILLED";
    tone = "info";
    glyph = "✓";
    note = "The paper order was filled; portfolio state is being reconciled.";
  } else if (
    result.executionDecision === "EXECUTE" &&
    result.signalState === "EXECUTE"
  ) {
    label = "PAPER PENDING";
    tone = "warning";
    glyph = "◷";
    note =
      "The engine and signal lifecycle are both executable. Paper Trading will process this automatically on the next scanner refresh.";
  } else if (result.executionDecision === "EXECUTE") {
    label = "PAPER NOT ACTIONABLE";
    tone = "warning";
    glyph = "!";
    note =
      "The engine decision is EXECUTE, but the signal lifecycle is not executable. No paper position will be opened.";
  }

  return (
    <section aria-labelledby="paper-execution-title">
      <SectionTitle id="paper-execution-title">Paper execution</SectionTitle>
      <div className="mt-2 rounded border border-zinc-800 bg-zinc-900/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge
            tone={tone as "bullish" | "danger" | "info" | "warning" | "muted"}
            glyph={glyph}
          >
            {label}
          </Badge>
          {result.executionDecision === "EXECUTE" &&
            result.signalState === "EXECUTE" &&
            !order &&
            onRefresh && (
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void onRefresh()}
              className="rounded-md border border-emerald-700/60 bg-emerald-950/20 px-2.5 py-1.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-900/30 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              {refreshing ? "Processing..." : "Refresh & process paper"}
            </button>
          )}
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{note}</p>

        {order && (
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
            <Metric label="Paper entry" value={formatPrice(result.symbol, order.fillPrice ?? order.requestedEntry)} />
            <Metric label="Paper SL" value={formatPrice(result.symbol, order.stopLoss)} />
            <Metric label="Paper TP" value={formatPrice(result.symbol, order.takeProfit)} />
            <Metric label="Paper size" value={formatFixed(order.positionSize, 2)} />
          </dl>
        )}
      </div>
    </section>
  );
}

function paperRejectionMessage(
  reason: string | null,
  result: SymbolScanResult
): string {
  switch (reason) {
    case "PAPER_SIGNAL_STATE_NOT_EXECUTE":
      return `Engine decision is EXECUTE, but the signal lifecycle is ${result.signalState ?? "not executable"}. Safety rules prevented a paper position from opening.`;
    case "PAPER_MARKET_DATA_NOT_FRESH":
      return "Market data was not FRESH, so Paper Trading rejected the entry.";
    case "PAPER_RISK_NOT_APPROVED":
      return "The Risk Engine did not approve this entry, so no paper position was opened.";
    case "PAPER_DIRECTION_INVALID":
      return "The signal direction was not LONG or SHORT, so Paper Trading rejected it.";
    case "PAPER_EXECUTION_SNAPSHOT_INCOMPLETE":
      return "The execution snapshot was incomplete. Paper Trading failed closed and did not open a position.";
    case "PAPER_EXECUTION_SNAPSHOT_INVALID":
      return "The execution snapshot contained invalid values. Paper Trading failed closed.";
    case "PAPER_INVALID_LONG_STOP":
      return "The LONG stop was not below entry, so the paper order was rejected.";
    case "PAPER_INVALID_SHORT_STOP":
      return "The SHORT stop was not above entry, so the paper order was rejected.";
    case "PAPER_MAX_OPEN_POSITIONS":
      return "The paper portfolio already reached its configured maximum number of open positions.";
    case "PAPER_MAX_TOTAL_RISK":
      return "Opening this trade would exceed the configured total paper portfolio risk limit.";
    case "PAPER_UPSTREAM_NOT_ANALYSED":
      return "The upstream scanner result was not fully analysed, so Paper Trading rejected it.";
    default:
      return reason
        ? `Paper execution was rejected: ${reason}.`
        : "Paper execution was rejected by a safety rule.";
  }
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

function DecisionDatum({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded border border-zinc-800 bg-zinc-900/30 px-2.5 py-2", className)}>
      <div className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-600">
        {label}
      </div>
      {value}
    </div>
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
