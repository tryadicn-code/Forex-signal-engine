import type { PaperOrder, PaperTrade } from "@/paper/types";
import {
  ORDERS_PAGE_SIZE,
  ORDERS_PREVIEW_COUNT,
  type OrdersView,
  type TradeFilterState,
  type TradeSort,
} from "./types";

export function isTradeFilterActive(filter: TradeFilterState): boolean {
  return (
    filter.query.trim() !== "" ||
    filter.outcome !== "ALL" ||
    filter.side !== "ALL" ||
    filter.dateFrom !== "" ||
    filter.dateTo !== ""
  );
}

export function witaDateString(epoch: number): string {
  const d = new Date(epoch + 8 * 60 * 60 * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

export function matchesTradeFilter(
  trade: {
    symbol: string;
    side: "LONG" | "SHORT";
    realizedR: number;
    closedAt: number;
  },
  filter: TradeFilterState
): boolean {
  if (filter.side !== "ALL" && trade.side !== filter.side) return false;
  if (filter.outcome === "WIN" && trade.realizedR <= 0) return false;
  if (filter.outcome === "LOSS" && trade.realizedR >= 0) return false;
  if (filter.outcome === "BE" && trade.realizedR !== 0) return false;
  const q = filter.query.trim().toLowerCase();
  if (q !== "" && !trade.symbol.toLowerCase().includes(q)) return false;
  if (filter.dateFrom !== "" || filter.dateTo !== "") {
    const tradeDate = witaDateString(trade.closedAt);
    if (filter.dateFrom !== "" && tradeDate < filter.dateFrom) return false;
    if (filter.dateTo !== "" && tradeDate > filter.dateTo) return false;
  }
  return true;
}

export function sortTrades(trades: PaperTrade[], sort: TradeSort): PaperTrade[] {
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

export function sortOrdersByRequestedAt(orders: PaperOrder[]): PaperOrder[] {
  return [...orders].sort((a, b) => b.requestedAt - a.requestedAt);
}

export function visibleOrders(sorted: PaperOrder[], view: OrdersView): PaperOrder[] {
  if (view.mode === "collapsed") return [];
  if (view.mode === "preview") return sorted.slice(0, ORDERS_PREVIEW_COUNT);
  const start = (view.page - 1) * ORDERS_PAGE_SIZE;
  return sorted.slice(start, start + ORDERS_PAGE_SIZE);
}

export function ordersTotalPages(count: number): number {
  return Math.max(1, Math.ceil(count / ORDERS_PAGE_SIZE));
}