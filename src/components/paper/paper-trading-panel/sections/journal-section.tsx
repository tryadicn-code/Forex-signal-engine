import { useState } from "react";
import type { PaperDashboardData } from "@/paper/types";
import {
  formatDateTimeShort,
  formatDuration,
  formatPrice,
} from "@/lib/format";
import { BiasBadge, DecisionBadge, FreshnessBadge } from "@/components/common/badges";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TRADE_FILTER,
  DEFAULT_TRADE_SORT,
  type TradeFilterState,
  type TradeSort,
} from "../lib/types";
import {
  isTradeFilterActive,
  matchesTradeFilter,
  sortTrades,
} from "../lib/filters";
import { money, pct, pnlTone } from "../lib/formatters";
import { EquityCurve } from "../components/equity-curve";
import { RDistribution } from "../components/r-distribution";
import { TradeFilterChip } from "../components/trade-filter-chip";
import { CopyTradeButton } from "../components/copy-trade-button";
import { metric } from "../components/metric";

export function JournalSection({ paper }: { paper: PaperDashboardData }) {
  const [tradeFilter, setTradeFilter] = useState<TradeFilterState>(DEFAULT_TRADE_FILTER);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [tradeSort, setTradeSort] = useState<TradeSort>(DEFAULT_TRADE_SORT);

  const { account, performance } = paper;
  const filteredTrades = paper.recentTrades.filter((trade) =>
    matchesTradeFilter(trade, tradeFilter)
  );
  const filterActive = isTradeFilterActive(tradeFilter);
  const sortedTrades = sortTrades(filteredTrades, tradeSort);
  const filterChipCount =
    Number(tradeFilter.outcome !== "ALL") +
    Number(tradeFilter.side !== "ALL") +
    Number(tradeFilter.dateFrom !== "" || tradeFilter.dateTo !== "");

  return (
    <section
      id="journal"
      aria-label="Paper journal & performance"
      className="scroll-mt-16 rounded-lg border border-zinc-800 bg-zinc-900/30"
    >
      <EquityCurve
        trades={paper.recentTrades}
        initialBalance={account.initialBalance}
        currency={account.currency}
      />

      <RDistribution trades={paper.recentTrades} />

      <div>
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Edge
          </h3>
          <span className="font-mono text-[11px] text-zinc-600">
            R-based
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 pb-3 sm:grid-cols-6">
          {metric(
            "Expectancy",
            performance.expectancyR === null ? "—" : performance.expectancyR.toFixed(2) + "R"
          )}
          {metric(
            "Avg R",
            performance.averageR === null ? "—" : performance.averageR.toFixed(2) + "R"
          )}
          {metric(
            "Median R",
            performance.medianR === null ? "—" : performance.medianR.toFixed(2) + "R"
          )}
          {metric(
            "Best",
            performance.bestTrade === null
              ? "—"
              : money(performance.bestTrade, account.currency),
            undefined,
            pnlTone(performance.bestTrade)
          )}
          {metric(
            "Worst",
            performance.worstTrade === null
              ? "—"
              : money(performance.worstTrade, account.currency),
            undefined,
            pnlTone(performance.worstTrade)
          )}
          {metric(
            "Profit factor",
            performance.profitFactor === null ? "—" : performance.profitFactor.toFixed(2)
          )}
        </div>
      </div>

      <div className="border-t border-zinc-800">
        <div className="flex items-center justify-between px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Activity & risk
          </h3>
          <span className="font-mono text-[11px] text-zinc-600">
            {performance.totalTrades} closed
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 pb-3 sm:grid-cols-6">
          {metric("Trades", String(performance.totalTrades))}
          {metric("Win rate", pct(performance.winRate))}
          {metric("Current DD", pct(performance.currentDrawdownPercent))}
          {metric("Max DD", pct(performance.maxDrawdownPercent))}
          {metric(
            "Avg hold",
            performance.averageHoldingTimeMs === null
              ? "—"
              : formatDuration(performance.averageHoldingTimeMs)
          )}
          {(() => {
            const w = performance.consecutiveWins;
            const l = performance.consecutiveLosses;
            if (w > 0) {
              return metric("Win streak", String(w), undefined, "positive");
            }
            if (l > 0) {
              return metric("Loss streak", String(l), undefined, "negative");
            }
            return metric("Streak", "—");
          })()}
        </div>
      </div>

      {paper.recentTrades.length === 0 ? (
        <p className="border-t border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
          Journal is empty. Results will appear after paper positions close.
        </p>
      ) : (
        <>
          <div className="border-t border-zinc-800">
            <div className="flex items-center justify-between px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Trades
              </h3>
              <span className="font-mono text-[11px] text-zinc-600">
                {filterActive
                  ? `${filteredTrades.length} of ${paper.recentTrades.length}`
                  : `${paper.recentTrades.length} total`}
              </span>
            </div>
            <div className="space-y-2 px-3 pb-2.5">
              <div className="flex gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search trades by symbol</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600"
                  >
                    <circle cx="8.5" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="m12 12 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    value={tradeFilter.query}
                    onChange={(event) =>
                      setTradeFilter((prev) => ({ ...prev, query: event.target.value }))
                    }
                    placeholder="Search symbol"
                    aria-label="Search trades by symbol"
                    className="h-9 w-full rounded-md border border-zinc-800 bg-[#0b0e14] pl-9 pr-3 font-mono text-[11px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40"
                  />
                </label>
                <select
                  value={tradeSort}
                  onChange={(event) =>
                    setTradeSort(event.target.value as TradeSort)
                  }
                  aria-label="Sort trades"
                  className="h-9 shrink-0 rounded-md border border-zinc-800 bg-[#0b0e14] px-2 font-mono text-[11px] text-zinc-300 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40"
                >
                  <option value="date-desc">Date ↓</option>
                  <option value="date-asc">Date ↑</option>
                  <option value="r-desc">R ↓</option>
                  <option value="r-asc">R ↑</option>
                  <option value="pnl-desc">PnL ↓</option>
                  <option value="hold-desc">Hold ↓</option>
                </select>
                <button
                  type="button"
                  aria-expanded={filterExpanded}
                  aria-controls="trade-filter-chips"
                  onClick={() => setFilterExpanded((value) => !value)}
                  aria-label="Toggle trade filters"
                  className={cn(
                    "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors",
                    filterExpanded || filterChipCount > 0
                      ? "border-emerald-700/60 bg-emerald-950/20 text-emerald-300"
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  )}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                    <path d="M3 5h14M5.5 10h9M8 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {filterChipCount > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-emerald-500 px-1 font-mono text-[9px] font-semibold leading-none text-zinc-950">
                      {filterChipCount}
                    </span>
                  )}
                </button>
              </div>
              {filterExpanded && (
                <div id="trade-filter-chips" className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                      Result
                    </span>
                    <div className="flex flex-1 gap-1.5 overflow-x-auto scrollbar-none">
                      {(["ALL", "WIN", "LOSS", "BE"] as const).map((chip) => (
                        <TradeFilterChip
                          key={chip}
                          active={tradeFilter.outcome === chip}
                          onClick={() => setTradeFilter((prev) => ({ ...prev, outcome: chip }))}
                        >
                          {chip === "ALL" ? "All" : chip === "WIN" ? "Wins" : chip === "LOSS" ? "Losses" : "BE"}
                        </TradeFilterChip>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                      Side
                    </span>
                    <div className="flex flex-1 gap-1.5 overflow-x-auto scrollbar-none">
                      {(["ALL", "LONG", "SHORT"] as const).map((chip) => (
                        <TradeFilterChip
                          key={chip}
                          active={tradeFilter.side === chip}
                          onClick={() => setTradeFilter((prev) => ({ ...prev, side: chip }))}
                        >
                          {chip === "ALL" ? "Any" : chip}
                        </TradeFilterChip>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                      From
                    </span>
                    <input
                      type="date"
                      value={tradeFilter.dateFrom}
                      onChange={(event) =>
                        setTradeFilter((prev) => ({ ...prev, dateFrom: event.target.value }))
                      }
                      aria-label="Filter trades from date"
                      className="h-9 flex-1 rounded-md border border-zinc-800 bg-[#0b0e14] px-2 font-mono text-[11px] text-zinc-300 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40 [color-scheme:dark]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                      To
                    </span>
                    <input
                      type="date"
                      value={tradeFilter.dateTo}
                      onChange={(event) =>
                        setTradeFilter((prev) => ({ ...prev, dateTo: event.target.value }))
                      }
                      aria-label="Filter trades to date"
                      className="h-9 flex-1 rounded-md border border-zinc-800 bg-[#0b0e14] px-2 font-mono text-[11px] text-zinc-300 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/40 [color-scheme:dark]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          {filteredTrades.length === 0 ? (
            <div className="border-t border-zinc-800 px-3 py-4 text-center">
              <p className="text-xs text-zinc-600">No trades match the current filter.</p>
              <button
                type="button"
                onClick={() => setTradeFilter(DEFAULT_TRADE_FILTER)}
                className="mt-2 rounded-md border border-zinc-800 px-2.5 py-1 font-mono text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              >
                Clear filter
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800 border-t border-zinc-800">
              {sortedTrades.map((trade) => (
                <details
                  key={trade.id}
                  className="group"
                >
                  <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span aria-hidden="true" className="font-mono text-[10px] text-zinc-600 transition-transform group-open:rotate-90">▸</span>
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
                        {trade.plannedRR !== null && "Planned 1:" + trade.plannedRR.toFixed(2) + " · "}MFE {(trade.maxFavorableR ?? 0) >= 0 ? "+" : ""}
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
                  </summary>

                  <div className="space-y-3 border-t border-zinc-800 bg-zinc-950/40 px-3 py-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                          Engine context
                        </div>
                        <CopyTradeButton trade={trade} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <BiasBadge bias={trade.engine.bias} />
                        <DecisionBadge decision={trade.engine.executionDecision} />
                        <FreshnessBadge status={trade.engine.freshness} />
                      </div>
                      <div className="mt-1.5 font-mono text-[11px] text-zinc-500">
                        Setup score: {trade.engine.setupScore === null ? "—" : trade.engine.setupScore.toFixed(0)}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-600 truncate" title={trade.engine.engineVersion}>
                        {trade.engine.engineVersion}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Planned vs realized</div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-400">
                        <div>Planned</div>
                        <div className="text-right text-zinc-200">
                          {trade.plannedRR === null ? "—" : "1:" + trade.plannedRR.toFixed(2)}
                        </div>
                        <div>Realized</div>
                        <div
                          className={
                            "text-right " +
                            (trade.realizedR > 0
                              ? "text-emerald-300"
                              : trade.realizedR < 0
                                ? "text-red-300"
                                : "text-zinc-300")
                          }
                        >
                          {trade.realizedR >= 0 ? "+" : ""}
                          {trade.realizedR.toFixed(2)}R
                        </div>
                        <div>Risk</div>
                        <div className="text-right text-zinc-300">
                          {money(trade.riskAmount, account.currency)} ({trade.riskPercent.toFixed(2)}%)
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Timing</div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-zinc-400">
                        <div>Opened</div>
                        <div className="text-right text-zinc-200">{formatDateTimeShort(trade.openedAt)}</div>
                        <div>Closed</div>
                        <div className="text-right text-zinc-200">{formatDateTimeShort(trade.closedAt)}</div>
                        <div>Hold</div>
                        <div className="text-right text-zinc-200">{formatDuration(trade.holdingDurationMs)}</div>
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}