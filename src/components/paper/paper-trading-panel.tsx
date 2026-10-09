"use client";

import { useState } from "react";
import type { PaperDashboardData } from "@/paper/types";
import { formatDateTimeShort, formatDuration, formatPrice, formatTimeShort } from "@/lib/format";

function money(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${currency} ${value.toFixed(2)}`;
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(2) + "%";
}

function riskReward(
  entryPrice: number,
  takeProfit: number | null,
  stopLoss: number
): string {
  if (takeProfit === null) return "—";

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);

  if (
    !Number.isFinite(risk) ||
    !Number.isFinite(reward) ||
    risk <= 0 ||
    reward < 0
  ) {
    return "—";
  }

  return `1:${(reward / risk).toFixed(2)}`;
}

function metric(
  label: string,
  value: string,
  note?: string,
  tone: "neutral" | "positive" | "negative" = "neutral"
): React.ReactNode {
  const valueClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-red-300"
        : "text-zinc-100";

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/35 px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </div>
      <div className={"mt-1 font-mono text-sm font-semibold tabular-nums " + valueClass}>
        {value}
      </div>
      {note && <div className="mt-1 text-[11px] text-zinc-600">{note}</div>}
    </div>
  );
}

export type PaperPanelView = "both" | "portfolio" | "journal";

export function PaperTradingPanel({
  paper,
  onReset,
  resetting,
  onClosePosition,
  onOpenAnalysis,
  closingPositionId = null,
  onSetInitialBalance,
  settingInitialBalance = false,
  view = "both",
}: {
  paper: PaperDashboardData | undefined;
  onReset: () => Promise<void>;
  resetting: boolean;
  onClosePosition?: (positionId: string) => Promise<void>;
  onOpenAnalysis?: (symbol: string) => void;
  closingPositionId?: string | null;
  onSetInitialBalance?: (initialBalance: number) => Promise<void>;
  settingInitialBalance?: boolean;
  view?: PaperPanelView;
}) {
  if (!paper) return null;

  const { account, performance } = paper;

  return (
    <div className="space-y-4">
      {view !== "journal" && (
      <section
        id="portfolio"
        aria-labelledby="paper-portfolio-title"
        className="scroll-mt-16 rounded-lg border border-zinc-800 bg-zinc-900/30"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-3 py-2.5 sm:items-center sm:px-4 sm:py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 id="paper-portfolio-title" className="text-[15px] font-semibold leading-tight text-zinc-100 sm:text-base">
                Paper portfolio
              </h2>
            </div>
          </div>
          <button
            type="button"
            disabled={resetting}
            onClick={() => void onReset()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-red-900/60 bg-red-950/15 px-2.5 text-[11px] font-medium text-red-300 transition-colors hover:border-red-800/70 hover:bg-red-950/30 hover:text-red-200 disabled:opacity-50"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
              <path d="M15.5 6.5A6 6 0 1 0 16 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M15.5 3.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{resetting ? "Resetting..." : "Reset"}</span>
          </button>
        </header>

        {onSetInitialBalance && (
          <InitialBalanceControl
            key={account.initialBalance}
            initialBalance={account.initialBalance}
            currency={account.currency}
            onApply={onSetInitialBalance}
            applying={settingInitialBalance}
          />
        )}

        {paper.persistenceError && (
          <div className="m-3 rounded-md border border-orange-800/50 bg-orange-950/20 px-3 py-2 text-xs text-orange-200">
            <span className="font-mono font-semibold">PAPER STORAGE</span>
            <span className="ml-2 text-orange-200/70">{paper.persistenceError}</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-1.5 p-2.5 lg:grid-cols-6">
          {metric("Balance", money(account.balance, account.currency))}
          {metric("Equity", money(account.equity, account.currency))}
          {metric(
            "Realized",
            money(account.realizedPnL, account.currency),
            undefined,
            account.realizedPnL > 0 ? "positive" : account.realizedPnL < 0 ? "negative" : "neutral"
          )}
          {metric(
            "Floating",
            money(account.unrealizedPnL, account.currency),
            undefined,
            account.unrealizedPnL > 0 ? "positive" : account.unrealizedPnL < 0 ? "negative" : "neutral"
          )}
          {metric(
            "Open risk",
            pct(account.openRiskPercent),
            money(account.openRiskAmount, account.currency)
          )}
          {metric("Open positions", String(account.openPositionCount))}
        </div>

        <div className="border-t border-zinc-800">
          <div className="flex items-center justify-between px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Open positions
            </h3>
            <span className="font-mono text-[11px] text-zinc-600">
              max {paper.config.maxOpenPositions} · {paper.config.maxOpenPositionsPerSymbol}/symbol · currency cap {paper.config.maxDirectionalCurrencyExposure}
            </span>
          </div>

          {paper.openPositions.length === 0 ? (
            <p className="border-t border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
              No paper positions are open. Only genuine EXECUTE signals can create one.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800 border-t border-zinc-800">
              {paper.openPositions.map((position) => (
                <article
                  key={position.id}
                  role={onOpenAnalysis ? "button" : undefined}
                  tabIndex={onOpenAnalysis ? 0 : undefined}
                  aria-label={
                    onOpenAnalysis
                      ? `Open analysis for ${position.symbol}`
                      : undefined
                  }
                  onClick={() => onOpenAnalysis?.(position.symbol)}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      onOpenAnalysis?.(position.symbol);
                    }
                  }}
                  className={
                    "border-b border-zinc-800/70 px-3 py-2.5 last:border-b-0 " +
                    (onOpenAnalysis
                      ? "cursor-pointer transition-colors hover:bg-zinc-800/35 focus-visible:bg-zinc-800/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700/70"
                      : "")
                  }
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-100">
                      {position.symbol}
                    </span>
                    {onOpenAnalysis && (
                      <span className="text-[11px] font-medium text-zinc-600">
                        Analysis ›
                      </span>
                    )}

                    <span
                      className={
                        "rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold " +
                        (position.side === "LONG"
                          ? "border-emerald-800/70 bg-emerald-950/20 text-emerald-300"
                          : "border-rose-800/70 bg-rose-950/20 text-rose-300")
                      }
                    >
                      {position.side}
                    </span>

                    <span className="rounded border border-sky-700/60 bg-sky-950/25 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
                      {position.positionSize.toFixed(2)} lot
                    </span>

                    <div className="ml-auto flex items-center gap-2">
                      <span
                        className={
                          "whitespace-nowrap font-mono text-xs font-semibold " +
                          (position.unrealizedPnL > 0
                            ? "text-emerald-300"
                            : position.unrealizedPnL < 0
                              ? "text-red-300"
                              : "text-zinc-200")
                        }
                      >
                        {money(position.unrealizedPnL, account.currency)}
                      </span>
                      {onClosePosition && (
                        <button
                          type="button"
                          disabled={closingPositionId !== null}
                          onClick={(event) => {
                            event.stopPropagation();
                            void onClosePosition(position.id);
                          }}
                          className="rounded border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-red-800/70 hover:bg-red-950/20 hover:text-red-300 disabled:opacity-40"
                        >
                          {closingPositionId === position.id ? "Closing…" : "Close"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] sm:text-[11px]">
                    <InlineDatum
                      label="Entry"
                      value={formatPrice(position.symbol, position.entryPrice)}
                    />
                    <InlineDatum
                      label="Current"
                      value={formatPrice(position.symbol, position.currentPrice)}
                    />
                    <InlineDatum
                      label="TP"
                      value={formatPrice(position.symbol, position.takeProfit)}
                      tone="positive"
                    />
                    <InlineDatum
                      label="SL"
                      value={formatPrice(position.symbol, position.stopLoss)}
                      tone="negative"
                    />
                  </div>

                  <div className="mt-1.5 font-mono text-[11px] text-zinc-600">
                    MFE {(position.maxFavorableR ?? 0) >= 0 ? "+" : ""}
                    {(position.maxFavorableR ?? 0).toFixed(2)}R · MAE{" "}
                    {(position.maxAdverseR ?? 0).toFixed(2)}R · RR{" "}
                    {riskReward(
                      position.entryPrice,
                      position.takeProfit,
                      position.stopLoss
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800">
          <div className="flex items-center justify-between px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Recent orders
            </h3>
            <span className="font-mono text-[11px] text-zinc-600">
              {paper.recentOrders.length} total
            </span>
          </div>

          {paper.recentOrders.length === 0 ? (
            <p className="border-t border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
              No paper orders recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800 border-t border-zinc-800">
              {paper.recentOrders
                .slice()
                .sort((a, b) => b.requestedAt - a.requestedAt)
                .slice(0, 5)
                .map((order) => (
                  <article key={order.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-zinc-100">
                        {order.symbol}
                      </span>
                      <span
                        className={
                          "rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold " +
                          (order.side === "LONG"
                            ? "border-emerald-800/70 bg-emerald-950/20 text-emerald-300"
                            : "border-rose-800/70 bg-rose-950/20 text-rose-300")
                        }
                      >
                        {order.side}
                      </span>
                      <span
                        className={
                          "rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold " +
                          (order.status === "FILLED"
                            ? "border-emerald-800/70 bg-emerald-950/20 text-emerald-300"
                            : "border-red-800/70 bg-red-950/20 text-red-300")
                        }
                      >
                        {order.status}
                      </span>
                      <span className="ml-auto font-mono text-[11px] tabular-nums text-zinc-600">
                        {formatTimeShort(order.requestedAt)}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                      <InlineDatum
                        label="Entry"
                        value={formatPrice(
                          order.symbol,
                          order.fillPrice ?? order.requestedEntry
                        )}
                      />
                      <InlineDatum
                        label="SL"
                        value={formatPrice(order.symbol, order.stopLoss)}
                        tone="negative"
                      />
                      <InlineDatum
                        label="TP"
                        value={formatPrice(order.symbol, order.takeProfit)}
                        tone="positive"
                      />
                      <InlineDatum
                        label="Size"
                        value={order.positionSize.toFixed(2)}
                      />
                    </div>

                    {order.status === "REJECTED" && order.rejectionReason && (
                      <div className="mt-1.5 font-mono text-[11px] text-red-300/80">
                        Rejected: {order.rejectionReason}
                      </div>
                    )}
                  </article>
                ))}
            </div>
          )}
        </div>
      </section>
      )}

      {view !== "portfolio" && (
      <section
        id="journal"
        aria-labelledby="paper-journal-title"
        className="scroll-mt-16 rounded-lg border border-zinc-800 bg-zinc-900/30"
      >
        <header className="border-b border-zinc-800 px-3 py-2.5 sm:px-4 sm:py-3">
          <h2 id="paper-journal-title" className="text-sm font-semibold text-zinc-100">
            Paper journal & performance
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Metrics are derived only from persisted closed paper trades.
          </p>
        </header>

        <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-8">
          {metric("Trades", String(performance.totalTrades))}
          {metric("Win rate", pct(performance.winRate))}
          {metric(
            "Profit factor",
            performance.profitFactor === null ? "—" : performance.profitFactor.toFixed(2)
          )}
          {metric(
            "Expectancy",
            performance.expectancyR === null ? "—" : performance.expectancyR.toFixed(2) + "R"
          )}
          {metric(
            "Avg R",
            performance.averageR === null ? "—" : performance.averageR.toFixed(2) + "R"
          )}
          {metric("Max DD", pct(performance.maxDrawdownPercent))}
          {metric("Win streak", String(performance.consecutiveWins))}
          {metric("Loss streak", String(performance.consecutiveLosses))}
        </div>

        {paper.recentTrades.length === 0 ? (
          <p className="border-t border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
            Journal is empty. Results will appear after paper positions close.
          </p>
        ) : (
          <div className="divide-y divide-zinc-800 border-t border-zinc-800">
            {paper.recentTrades.map((trade) => (
              <article
                key={trade.id}
                className="grid grid-cols-[1fr_auto] gap-3 px-3 py-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-100">{trade.symbol}</span>
                    <span className="font-mono text-[11px] text-zinc-500">{trade.side}</span>
                    <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500">
                      {trade.closeReason}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-zinc-600">
                    {formatPrice(trade.symbol, trade.entryPrice)} → {formatPrice(trade.symbol, trade.exitPrice)}
                    {" · "}
                    {formatDuration(trade.holdingDurationMs)}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-zinc-500">
                    {trade.plannedRR !== null && "Planned 1:" + trade.plannedRR.toFixed(2) + " \u00B7 "}MFE {(trade.maxFavorableR ?? 0) >= 0 ? "+" : ""}
                    {(trade.maxFavorableR ?? 0).toFixed(2)}R · MAE{" "}
                    {(trade.maxAdverseR ?? 0).toFixed(2)}R
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[11px] text-zinc-600">
                    {formatDateTimeShort(trade.closedAt)}
                  </div>
                  <div
                    className={
                      "font-mono text-sm font-semibold " +
                      (trade.realizedPnL > 0
                        ? "text-emerald-300"
                        : trade.realizedPnL < 0
                          ? "text-red-300"
                          : "text-zinc-100")
                    }
                  >
                    {money(trade.realizedPnL, account.currency)}
                  </div>
                  <div
                    className={
                      "font-mono text-[11px] " +
                      (trade.realizedR > 0
                        ? "text-emerald-400"
                        : trade.realizedR < 0
                          ? "text-red-400"
                          : "text-zinc-500")
                    }
                  >
                    {trade.realizedR >= 0 ? "+" : ""}
                    {trade.realizedR.toFixed(2)}R
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  );
}


function InitialBalanceControl({
  initialBalance,
  currency,
  onApply,
  applying,
}: {
  initialBalance: number;
  currency: string;
  onApply: (initialBalance: number) => Promise<void>;
  applying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(initialBalance));
  const parsedBalance = Number(balanceInput);
  const valid =
    Number.isFinite(parsedBalance) &&
    parsedBalance > 0 &&
    parsedBalance <= 1_000_000_000;

  return (
    <div className="border-b border-zinc-800 px-3 py-2">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-600">
            Demo balance
          </span>
          <span className="h-3 w-px shrink-0 bg-zinc-800" aria-hidden="true" />
          <span className="truncate font-mono text-[11px] tabular-nums text-zinc-300">
            {currency} {initialBalance.toFixed(2)}
          </span>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/40 px-2 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3 w-3">
            <path d="m4 14.5-.5 2.5 2.5-.5L15 7.5 12.5 5 4 14.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="m11.5 6 2.5 2.5" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span>{expanded ? "Hide" : "Edit"}</span>
        </button>
      </div>

      {expanded && (
        <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/45 p-2.5">
          <p className="text-[11px] leading-relaxed text-amber-300/75">
            Changing the demo balance resets positions, orders, journal, and performance.
          </p>
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <span className="font-mono text-[11px] text-zinc-500">{currency}</span>
            <input
              type="number"
              min="1"
              max="1000000000"
              step="100"
              inputMode="decimal"
              value={balanceInput}
              onChange={(event) => setBalanceInput(event.target.value)}
              className="h-10 min-w-0 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 font-mono text-[11px] text-zinc-100 outline-none focus:border-emerald-700"
              aria-label="Initial paper balance"
            />
            <button
              type="button"
              disabled={applying || !valid || parsedBalance === initialBalance}
              onClick={() => {
                void onApply(parsedBalance).then(() => setExpanded(false));
              }}
              className="h-10 rounded-md border border-emerald-800/70 bg-emerald-950/20 px-2.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-950/35 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {applying ? "Applying..." : "Apply & Reset"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function InlineDatum({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-red-300"
        : "text-zinc-300";

  return (
    <div className="min-w-0 whitespace-nowrap text-center">
      <span className={tone === "neutral" ? "text-zinc-600" : toneClass}>
        {label}
      </span>
      <span className={"ml-1 font-mono tabular-nums " + toneClass}>
        {value}
      </span>
    </div>
  );
}
