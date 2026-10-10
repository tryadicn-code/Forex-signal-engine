"use client";

import { useState } from "react";
import type { PaperDashboardData, PaperOrder, PaperTrade } from "@/paper/types";
import { formatDateTimeShort, formatDuration, formatPrice, formatTimeShort } from "@/lib/format";
import { BiasBadge, DecisionBadge, FreshnessBadge } from "@/components/common/badges";
import { cn } from "@/lib/utils";

type TradeOutcomeFilter = "ALL" | "WIN" | "LOSS" | "BE";
type TradeSideFilter = "ALL" | "LONG" | "SHORT";

type TradeSort =
  | "date-desc"
  | "date-asc"
  | "r-desc"
  | "r-asc"
  | "pnl-desc"
  | "hold-desc";

const DEFAULT_TRADE_SORT: TradeSort = "date-desc";

interface TradeFilterState {
  query: string;
  outcome: TradeOutcomeFilter;
  side: TradeSideFilter;
}

const DEFAULT_TRADE_FILTER: TradeFilterState = {
  query: "",
  outcome: "ALL",
  side: "ALL",
};

function isTradeFilterActive(filter: TradeFilterState): boolean {
  return (
    filter.query.trim() !== "" ||
    filter.outcome !== "ALL" ||
    filter.side !== "ALL"
  );
}

function matchesTradeFilter(
  trade: { symbol: string; side: "LONG" | "SHORT"; realizedR: number },
  filter: TradeFilterState
): boolean {
  if (filter.side !== "ALL" && trade.side !== filter.side) return false;
  if (filter.outcome === "WIN" && trade.realizedR <= 0) return false;
  if (filter.outcome === "LOSS" && trade.realizedR >= 0) return false;
  if (filter.outcome === "BE" && trade.realizedR !== 0) return false;
  const q = filter.query.trim().toLowerCase();
  if (q !== "" && !trade.symbol.toLowerCase().includes(q)) return false;
  return true;
}

function sortTrades(trades: PaperTrade[], sort: TradeSort): PaperTrade[] {
  const copy = [...trades];
  switch (sort) {
    case "date-desc":
      return copy.sort((a, b) => b.closedAt - a.closedAt);
    case "date-asc":
      return copy.sort((a, b) => a.closedAt - b.closedAt);
    case "r-desc":
      return copy.sort((a, b) => b.realizedR - a.realizedR);
    case "r-asc":
      return copy.sort((a, b) => a.realizedR - b.realizedR);
    case "pnl-desc":
      return copy.sort((a, b) => b.realizedPnL - a.realizedPnL);
    case "hold-desc":
      return copy.sort((a, b) => b.holdingDurationMs - a.holdingDurationMs);
  }
}
function TradeFilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-md border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wide transition-colors",
        active
          ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-300"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
      )}
    >
      {children}
    </button>
  );
}
type OrdersView =
  | { mode: "collapsed" }
  | { mode: "preview" }
  | { mode: "paged"; page: number };

const ORDERS_PREVIEW_COUNT = 5;
const ORDERS_PAGE_SIZE = 10;

function sortOrdersByRequestedAt(orders: PaperOrder[]): PaperOrder[] {
  return [...orders].sort((a, b) => b.requestedAt - a.requestedAt);
}

function visibleOrders(sorted: PaperOrder[], view: OrdersView): PaperOrder[] {
  if (view.mode === "collapsed") return [];
  if (view.mode === "preview") return sorted.slice(0, ORDERS_PREVIEW_COUNT);
  const start = (view.page - 1) * ORDERS_PAGE_SIZE;
  return sorted.slice(start, start + ORDERS_PAGE_SIZE);
}

function ordersTotalPages(count: number): number {
  return Math.max(1, Math.ceil(count / ORDERS_PAGE_SIZE));
}

function curvePoints(
  trades: PaperTrade[],
  baseline: number,
  metric: (trade: PaperTrade) => number
): { t: number; value: number }[] {
  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  const points: { t: number; value: number }[] = [{ t: 0, value: baseline }];
  let cumulative = baseline;
  for (const trade of sorted) {
    cumulative += metric(trade);
    points.push({ t: points.length, value: cumulative });
  }
  return points;
}

type EquityCurveMode = "usd" | "r";

function EquityCurve({
  trades,
  initialBalance,
  currency,
}: {
  trades: PaperTrade[];
  initialBalance: number;
  currency: string;
}) {
  const [mode, setMode] = useState<EquityCurveMode>("usd");

  if (trades.length < 2) {
    return (
      <div className="border-t border-zinc-800 px-3 py-3 text-center text-[11px] text-zinc-600">
        Equity curve appears after 2+ closed trades.
      </div>
    );
  }

  const isUsd = mode === "usd";
  const baseline = isUsd ? initialBalance : 0;
  const metric: (t: PaperTrade) => number = isUsd
    ? (t) => t.realizedPnL
    : (t) => t.realizedR;
  const points = curvePoints(trades, baseline, metric);
  const width = 300;
  const height = 80;
  const pad = 6;
  const values = points.map((p) => p.value);
  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  const range = max - min || 1;
  const maxT = points.length - 1 || 1;
  const finalValue = points[points.length - 1].value;
  const positive = finalValue >= baseline;
  const strokeColor = positive ? "rgb(52 211 153)" : "rgb(248 113 113)";
  const baselineY =
    height - pad - ((baseline - min) / range) * (height - pad * 2);

  const fmt = (v: number) =>
    isUsd
      ? currency + " " + v.toFixed(2)
      : (v >= 0 ? "+" : "") + v.toFixed(2) + "R";

  const path = points
    .map((p, i) => {
      const x = pad + (p.t / maxT) * (width - pad * 2);
      const y = height - pad - ((p.value - min) / range) * (height - pad * 2);
      return (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
    })
    .join(" ");

  return (
    <div className="border-t border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Equity curve
          </h3>
          <div className="flex gap-0.5">
            {(["usd", "r"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  mode === m
                    ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-300"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                )}
              >
                {m === "usd" ? "USD" : "R"}
              </button>
            ))}
          </div>
        </div>
        <span className="font-mono text-[11px] text-zinc-600">
          {fmt(min)} → {fmt(max)}
        </span>
      </div>
      <div className="px-3 pb-3">
        <svg
          viewBox={"0 0 " + width + " " + height}
          role="img"
          aria-label={
            isUsd
              ? "Paper trading equity curve in account currency"
              : "Paper trading cumulative R curve"
          }
          className="h-20 w-full"
          preserveAspectRatio="none"
        >
          <line
            x1={pad}
            y1={baselineY}
            x2={width - pad}
            y2={baselineY}
            stroke="rgb(63 63 70)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
          <span>Start {fmt(baseline)}</span>
          <span className={positive ? "text-emerald-300" : "text-red-300"}>
            Now {fmt(finalValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface RDistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  kind: "loss" | "flat" | "win";
}

function rDistribution(trades: PaperTrade[]): RDistributionBucket[] {
  const buckets: RDistributionBucket[] = [
    { label: "≤-3", min: -Infinity, max: -3, count: 0, kind: "loss" },
    { label: "-2", min: -3, max: -2, count: 0, kind: "loss" },
    { label: "-1", min: -2, max: -1, count: 0, kind: "loss" },
    { label: "0", min: -1, max: 1, count: 0, kind: "flat" },
    { label: "+1", min: 1, max: 2, count: 0, kind: "win" },
    { label: "+2", min: 2, max: 3, count: 0, kind: "win" },
    { label: "≥+3", min: 3, max: Infinity, count: 0, kind: "win" },
  ];
  for (const trade of trades) {
    const r = trade.realizedR;
    const bucket = buckets.find((b) => r >= b.min && r < b.max);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

function RDistribution({ trades }: { trades: PaperTrade[] }) {
  if (trades.length < 3) {
    return (
      <div className="border-t border-zinc-800 px-3 py-3 text-center text-[11px] text-zinc-600">
        R distribution appears after 3+ closed trades.
      </div>
    );
  }

  const buckets = rDistribution(trades);
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const width = 300;
  const height = 80;
  const pad = 6;
  const barGap = 4;
  const barCount = buckets.length;
  const barWidth = (width - pad * 2 - barGap * (barCount - 1)) / barCount;
  const chartHeight = height - pad * 2;

  return (
    <div className="border-t border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          R distribution
        </h3>
        <span className="font-mono text-[11px] text-zinc-600">
          {trades.length} trades
        </span>
      </div>
      <div className="px-3 pb-3">
        <svg
          viewBox={"0 0 " + width + " " + height}
          role="img"
          aria-label="R-multiple distribution across closed trades"
          className="h-20 w-full"
          preserveAspectRatio="none"
        >
          {buckets.map((bucket, i) => {
            const x = pad + i * (barWidth + barGap);
            const barHeight =
              bucket.count === 0 ? 0 : (bucket.count / maxCount) * chartHeight;
            const y = height - pad - barHeight;
            const fill =
              bucket.kind === "win"
                ? "rgb(52 211 153)"
                : bucket.kind === "loss"
                  ? "rgb(248 113 113)"
                  : "rgb(113 113 122)";
            return (
              <rect
                key={bucket.label}
                x={x.toFixed(2)}
                y={y.toFixed(2)}
                width={barWidth.toFixed(2)}
                height={barHeight.toFixed(2)}
                fill={fill}
                fillOpacity={bucket.count === 0 ? 0.15 : 0.85}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        <div className="mt-1 grid grid-cols-7 gap-1 font-mono text-[10px] text-zinc-600">
          {buckets.map((bucket) => (
            <div key={bucket.label} className="text-center">
              <div className="text-zinc-400">{bucket.label}</div>
              <div
                className={
                  bucket.kind === "win"
                    ? "text-emerald-400"
                    : bucket.kind === "loss"
                      ? "text-red-400"
                      : "text-zinc-500"
                }
              >
                {bucket.count}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function isoWita(epoch: number): string {
  const wita = new Date(epoch + 8 * 60 * 60 * 1000);
  const yyyy = wita.getUTCFullYear();
  const mm = String(wita.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(wita.getUTCDate()).padStart(2, "0");
  const hh = String(wita.getUTCHours()).padStart(2, "0");
  const mi = String(wita.getUTCMinutes()).padStart(2, "0");
  const ss = String(wita.getUTCSeconds()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd + "T" + hh + ":" + mi + ":" + ss + "+08:00";
}

export function tradesToCsv(trades: PaperTrade[]): string {
  const headers = [
    "id", "symbol", "side", "closeReason",
    "entryPrice", "exitPrice", "stopLoss", "takeProfit",
    "positionSize", "riskAmount", "riskPercent", "plannedRR",
    "realizedPnL", "realizedPnLPercent", "realizedR",
    "maxFavorableR", "maxAdverseR",
    "openedAt", "closedAt", "holdingDurationMs",
    "engineBias", "engineSetupScore", "engineExecutionDecision", "engineFreshness",
  ];
  const sorted = [...trades].sort((a, b) => b.closedAt - a.closedAt);
  const rows = sorted.map((t) =>
    [
      t.id,
      t.symbol,
      t.side,
      t.closeReason,
      t.entryPrice,
      t.exitPrice,
      t.stopLoss,
      t.takeProfit === null ? "" : t.takeProfit,
      t.positionSize,
      t.riskAmount,
      t.riskPercent,
      t.plannedRR === null ? "" : t.plannedRR,
      t.realizedPnL,
      t.realizedPnLPercent,
      t.realizedR,
      t.maxFavorableR === undefined ? "" : t.maxFavorableR,
      t.maxAdverseR === undefined ? "" : t.maxAdverseR,
      isoWita(t.openedAt),
      isoWita(t.closedAt),
      t.holdingDurationMs,
      t.engine.bias ?? "",
      t.engine.setupScore === null ? "" : t.engine.setupScore,
      t.engine.executionDecision ?? "",
      t.engine.freshness ?? "",
    ]
      .map((cell) => csvEscape(String(cell)))
      .join(",")
  );
  return [headers.join(","), ...rows].join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function csvFilename(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return "paper-trades-" + yyyy + mm + dd + "-" + hh + mi + ss + ".csv";
}

function money(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${currency} ${value.toFixed(2)}`;
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(2) + "%";
}

function pnlTone(value: number | null): "neutral" | "positive" | "negative" {
  if (value === null || !Number.isFinite(value) || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
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
  const [tradeFilter, setTradeFilter] = useState<TradeFilterState>(DEFAULT_TRADE_FILTER);
  const [ordersView, setOrdersView] = useState<OrdersView>({ mode: "collapsed" });
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [tradeSort, setTradeSort] = useState<TradeSort>(DEFAULT_TRADE_SORT);

  if (!paper) return null;

  const { account, performance } = paper;
  const filteredTrades = paper.recentTrades.filter((trade) =>
    matchesTradeFilter(trade, tradeFilter)
  );
  const filterActive = isTradeFilterActive(tradeFilter);
  const sortedTrades = sortTrades(filteredTrades, tradeSort);
  const filterChipCount =
    Number(tradeFilter.outcome !== "ALL") + Number(tradeFilter.side !== "ALL");
  const sortedOrders = sortOrdersByRequestedAt(paper.recentOrders);
  const shownOrders = visibleOrders(sortedOrders, ordersView);
  const totalOrderPages = ordersTotalPages(sortedOrders.length);

  return (
    <div className="space-y-4">
      {view !== "journal" && (
      <section
        id="portfolio"
        aria-label="Paper portfolio"
        className="scroll-mt-16 rounded-lg border border-zinc-800 bg-zinc-900/30"
      >
        {onSetInitialBalance && (
          <InitialBalanceControl
            key={account.initialBalance}
            initialBalance={account.initialBalance}
            currency={account.currency}
            onApply={onSetInitialBalance}
            applying={settingInitialBalance}
            onReset={onReset}
            resetting={resetting}
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
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-zinc-600">
                {sortedOrders.length} total
              </span>
              {sortedOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setOrdersView((prev) =>
                      prev.mode === "collapsed"
                        ? { mode: "preview" }
                        : { mode: "collapsed" }
                    )
                  }
                  className="rounded border border-zinc-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                >
                  {ordersView.mode === "collapsed" ? "▸ Show" : "▾ Hide"}
                </button>
              )}
            </div>
          </div>

          {sortedOrders.length === 0 ? (
            <p className="border-t border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
              No paper orders recorded yet.
            </p>
          ) : ordersView.mode === "collapsed" ? null : (
            <>
              <div className="divide-y divide-zinc-800 border-t border-zinc-800">
                {shownOrders.map((order) => (
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

              {ordersView.mode === "preview" && sortedOrders.length > ORDERS_PREVIEW_COUNT && (
                <div className="border-t border-zinc-800 px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setOrdersView({ mode: "paged", page: 1 })}
                    className="font-mono text-[11px] text-zinc-400 hover:text-zinc-200"
                  >
                    Show all ({sortedOrders.length}) →
                  </button>
                </div>
              )}

              {ordersView.mode === "paged" && (
                <div className="border-t border-zinc-800 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={ordersView.page <= 1}
                      onClick={() =>
                        setOrdersView({ mode: "paged", page: ordersView.page - 1 })
                      }
                      className="rounded border border-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
                    >
                      ◀ Prev
                    </button>
                    <span className="font-mono text-[11px] text-zinc-500">
                      Page {ordersView.page} / {totalOrderPages}
                    </span>
                    <button
                      type="button"
                      disabled={ordersView.page >= totalOrderPages}
                      onClick={() =>
                        setOrdersView({ mode: "paged", page: ordersView.page + 1 })
                      }
                      className="rounded border border-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
                    >
                      Next ▶
                    </button>
                  </div>
                  <div className="mt-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => setOrdersView({ mode: "preview" })}
                      className="font-mono text-[11px] text-zinc-500 hover:text-zinc-300"
                    >
                      ← Show less
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
      )}

      {view !== "portfolio" && (
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
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Engine context</div>
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
      )}
    </div>
  );
}


function InitialBalanceControl({
  initialBalance,
  currency,
  onApply,
  applying,
  onReset,
  resetting,
}: {
  initialBalance: number;
  currency: string;
  onApply: (initialBalance: number) => Promise<void>;
  applying: boolean;
  onReset?: () => Promise<void>;
  resetting?: boolean;
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
        <div className="flex shrink-0 items-center gap-1">
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
          {onReset && (
            <button
              type="button"
              disabled={resetting}
              onClick={() => void onReset()}
              aria-label="Reset paper account"
              title="Reset paper account"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-900/60 bg-red-950/15 text-red-300 transition-colors hover:border-red-800/70 hover:bg-red-950/30 hover:text-red-200 disabled:opacity-50"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                <path d="M15.5 6.5A6 6 0 1 0 16 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M15.5 3.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
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
