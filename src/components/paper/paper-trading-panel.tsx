"use client";

import type { PaperDashboardData } from "@/paper/types";
import { formatDuration, formatPrice } from "@/lib/format";

function money(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${currency} ${value.toFixed(2)}`;
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(2) + "%";
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
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </div>
      <div className={"mt-1.5 font-mono text-base font-semibold tabular-nums " + valueClass}>
        {value}
      </div>
      {note && <div className="mt-1 text-[10px] text-zinc-600">{note}</div>}
    </div>
  );
}

export type PaperPanelView = "both" | "portfolio" | "journal";

export function PaperTradingPanel({
  paper,
  onReset,
  resetting,
  view = "both",
}: {
  paper: PaperDashboardData | undefined;
  onReset: () => Promise<void>;
  resetting: boolean;
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
        className="scroll-mt-16 rounded-md border border-zinc-800 bg-zinc-900/30"
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="paper-portfolio-title" className="text-sm font-semibold text-zinc-100">
                Paper portfolio
              </h2>
              <span className="rounded border border-amber-700/60 bg-amber-950/20 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-amber-300">
                PAPER
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Simulated execution only. No broker orders or real funds.
            </p>
          </div>
          <button
            type="button"
            disabled={resetting}
            onClick={() => void onReset()}
            className="rounded-md border border-zinc-700 px-2.5 py-1.5 text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-50"
          >
            {resetting ? "Resetting..." : "Reset paper"}
          </button>
        </header>

        {paper.persistenceError && (
          <div className="m-3 rounded-md border border-orange-800/50 bg-orange-950/20 px-3 py-2 text-xs text-orange-200">
            <span className="font-mono font-semibold">PAPER STORAGE</span>
            <span className="ml-2 text-orange-200/70">{paper.persistenceError}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
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
          <div className="flex items-center justify-between px-3 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Open positions
            </h3>
            <span className="font-mono text-[10px] text-zinc-600">
              max {paper.config.maxOpenPositions} · risk cap {paper.config.maxTotalOpenRiskPercent}%
            </span>
          </div>

          {paper.openPositions.length === 0 ? (
            <p className="border-t border-zinc-800 px-3 py-5 text-center text-xs text-zinc-600">
              No paper positions are open. Only genuine EXECUTE signals can create one.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800 border-t border-zinc-800">
              {paper.openPositions.map((position) => (
                <article key={position.id} className="grid gap-3 px-3 py-3 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-zinc-100">{position.symbol}</span>
                      <span
                        className={
                          "rounded border px-1.5 py-0.5 font-mono text-[9px] " +
                          (position.side === "LONG"
                            ? "border-emerald-800/70 text-emerald-300"
                            : "border-rose-800/70 text-rose-300")
                        }
                      >
                        {position.side}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-600">
                        {position.positionSize.toFixed(2)} lot
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-[10px]">
                      <Quote label="Entry" value={formatPrice(position.symbol, position.entryPrice)} />
                      <Quote label="Current" value={formatPrice(position.symbol, position.currentPrice)} />
                      <Quote label="SL" value={formatPrice(position.symbol, position.stopLoss)} tone="negative" />
                      <Quote label="TP" value={formatPrice(position.symbol, position.takeProfit)} tone="positive" />
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end sm:justify-center">
                    <div className="text-right">
                      <div
                        className={
                          "font-mono text-sm font-semibold " +
                          (position.unrealizedPnL > 0
                            ? "text-emerald-300"
                            : position.unrealizedPnL < 0
                              ? "text-red-300"
                              : "text-zinc-100")
                        }
                      >
                        {money(position.unrealizedPnL, account.currency)}
                      </div>
                      <div
                        className={
                          "font-mono text-[10px] " +
                          (position.currentR > 0
                            ? "text-emerald-400"
                            : position.currentR < 0
                              ? "text-red-400"
                              : "text-zinc-500")
                        }
                      >
                        {position.currentR >= 0 ? "+" : ""}
                        {position.currentR.toFixed(2)}R
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-600">
                      {formatDuration(position.updatedAt - position.openedAt)}
                    </span>
                  </div>
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
        className="scroll-mt-16 rounded-md border border-zinc-800 bg-zinc-900/30"
      >
        <header className="border-b border-zinc-800 px-3 py-3">
          <h2 id="paper-journal-title" className="text-sm font-semibold text-zinc-100">
            Paper journal & performance
          </h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Metrics are derived only from persisted closed paper trades.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-8">
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
          <p className="border-t border-zinc-800 px-3 py-5 text-center text-xs text-zinc-600">
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
                    <span className="font-mono text-[10px] text-zinc-500">{trade.side}</span>
                    <span className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">
                      {trade.closeReason}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-zinc-600">
                    {formatPrice(trade.symbol, trade.entryPrice)} → {formatPrice(trade.symbol, trade.exitPrice)}
                    {" · "}
                    {formatDuration(trade.holdingDurationMs)}
                  </div>
                </div>
                <div className="text-right">
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
                      "font-mono text-[10px] " +
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

function Quote({
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
    <div className="min-w-0">
      <div className={"uppercase tracking-wide " + (tone === "neutral" ? "text-zinc-600" : toneClass)}>
        {label}
      </div>
      <div className={"truncate font-mono " + toneClass}>{value}</div>
    </div>
  );
}
