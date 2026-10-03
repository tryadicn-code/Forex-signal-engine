import type { Timeframe } from "@/types/market";

export interface PriceChartCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PriceChartResponse {
  symbol: string;
  timeframe: Timeframe;
  source: string;
  asOf: number;
  pricePrecision: number;
  candles: PriceChartCandle[];
}
