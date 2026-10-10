export type TradeOutcomeFilter = "ALL" | "WIN" | "LOSS" | "BE";
export type TradeSideFilter = "ALL" | "LONG" | "SHORT";

export type TradeSort =
  | "date-desc"
  | "date-asc"
  | "r-desc"
  | "r-asc"
  | "pnl-desc"
  | "hold-desc";

export const DEFAULT_TRADE_SORT: TradeSort = "date-desc";

export interface TradeFilterState {
  query: string;
  outcome: TradeOutcomeFilter;
  side: TradeSideFilter;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_TRADE_FILTER: TradeFilterState = {
  query: "",
  outcome: "ALL",
  side: "ALL",
  dateFrom: "",
  dateTo: "",
};

export type OrdersView =
  | { mode: "collapsed" }
  | { mode: "preview" }
  | { mode: "paged"; page: number };

export const ORDERS_PREVIEW_COUNT = 5;
export const ORDERS_PAGE_SIZE = 10;

export type EquityCurveMode = "usd" | "r";

export interface RDistributionBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  kind: "loss" | "flat" | "win";
}