"use client";

import { useEffect, useMemo, useState } from "react";
import type { PriceChartResponse } from "@/types/chart";
import type { Timeframe } from "@/types/market";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["M15", "H1", "H4", "D1"];
const VISIBLE_BARS = 120;
const WIDTH = 900;
const HEIGHT = 380;
const PAD = { top: 18, right: 70, bottom: 28, left: 10 };

export function PriceChart({
  symbol,
  asOf,
}: {
  symbol: string;
  asOf: number | null;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("H1");
  const [data, setData] = useState<PriceChartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      symbol,
      timeframe,
      limit: "200",
    });
    if (asOf !== null) params.set("asOf", String(asOf));

    fetch("/api/market/candles?" + params.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? "Chart data request failed.");
        }
        return (await response.json()) as PriceChartResponse;
      })
      .then((next) => {
        setError(null);
        setData(next);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
    return () => controller.abort();
  }, [symbol, timeframe, asOf]);

  return (
    <section aria-label={"Price chart for " + symbol} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-md border border-zinc-800 bg-zinc-950/60 p-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              aria-pressed={timeframe === tf}
              onClick={() => {
                if (tf === timeframe) return;
                setData(null);
                setError(null);
                setTimeframe(tf);
              }}
              className={cn(
                "rounded px-2.5 py-1.5 font-mono text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600",
                timeframe === tf
                  ? "bg-emerald-950/60 text-emerald-300"
                  : "text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200"
              )}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="text-right">
          <div className="font-mono text-xs font-semibold text-zinc-200">
            {data?.candles.length
              ? formatPrice(symbol, data.candles[data.candles.length - 1].close)
              : "—"}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-600">
            {timeframe} · closed candles
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-800 bg-[#090c11]">
        {!data && !error ? (
          <div
            aria-busy="true"
            className="flex h-72 items-center justify-center text-xs text-zinc-600"
          >
            Loading price chart…
          </div>
        ) : error ? (
          <div role="alert" className="flex h-72 flex-col items-center justify-center p-5 text-center">
            <div className="font-mono text-xs font-semibold text-orange-300">
              CHART DATA UNAVAILABLE
            </div>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500">{error}</p>
          </div>
        ) : data && data.candles.length > 0 ? (
          <CandlesSvg data={data} />
        ) : (
          <div className="flex h-72 items-center justify-center text-xs text-zinc-600">
            No closed candles available.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-600">
        <span>
          {data ? Math.min(data.candles.length, VISIBLE_BARS) : 0} visible · {data?.candles.length ?? 0} loaded
        </span>
        <span>
          {data?.source ? data.source.toUpperCase() + " provider" : "—"}
        </span>
      </div>
    </section>
  );
}

function CandlesSvg({ data }: { data: PriceChartResponse }) {
  const model = useMemo(() => chartModel(data), [data]);

  return (
    <svg
      viewBox={"0 0 " + WIDTH + " " + HEIGHT}
      role="img"
      aria-label={
        data.symbol +
        " " +
        data.timeframe +
        " candlestick chart with " +
        model.candles.length +
        " closed candles"
      }
      className="block h-auto min-h-64 w-full touch-pan-y select-none"
      preserveAspectRatio="none"
    >
      <rect width={WIDTH} height={HEIGHT} fill="#090c11" />

      {model.gridY.map((grid) => (
        <g key={grid.y}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={grid.y}
            y2={grid.y}
            stroke="#27272a"
            strokeWidth="1"
          />
          <text
            x={WIDTH - PAD.right + 8}
            y={grid.y + 4}
            fill="#71717a"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            {grid.label}
          </text>
        </g>
      ))}

      {model.candles.map((candle) => (
        <g key={candle.timestamp}>
          <line
            x1={candle.x}
            x2={candle.x}
            y1={candle.highY}
            y2={candle.lowY}
            stroke={candle.up ? "#34d399" : "#fb7185"}
            strokeWidth="1.2"
          />
          <rect
            x={candle.x - candle.bodyWidth / 2}
            y={candle.bodyY}
            width={candle.bodyWidth}
            height={candle.bodyHeight}
            rx="0.5"
            fill={candle.up ? "#10b981" : "#e11d48"}
          />
        </g>
      ))}

      <line
        x1={PAD.left}
        x2={WIDTH - PAD.right}
        y1={HEIGHT - PAD.bottom}
        y2={HEIGHT - PAD.bottom}
        stroke="#3f3f46"
        strokeWidth="1"
      />

      <text
        x={PAD.left}
        y={HEIGHT - 8}
        fill="#52525b"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
      >
        {model.startLabel}
      </text>
      <text
        x={WIDTH - PAD.right}
        y={HEIGHT - 8}
        textAnchor="end"
        fill="#52525b"
        fontSize="10"
        fontFamily="ui-monospace, monospace"
      >
        {model.endLabel}
      </text>
    </svg>
  );
}

function chartModel(data: PriceChartResponse) {
  const source = data.candles.slice(-VISIBLE_BARS);
  const highs = source.map((candle) => candle.high);
  const lows = source.map((candle) => candle.low);
  let max = Math.max(...highs);
  let min = Math.min(...lows);
  const span = Math.max(max - min, Math.abs(max) * 0.0001, 1e-8);
  const extra = span * 0.08;
  max += extra;
  min -= extra;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const step = plotWidth / Math.max(source.length, 1);
  const bodyWidth = Math.max(1.5, Math.min(5, step * 0.62));
  const y = (value: number) =>
    PAD.top + ((max - value) / Math.max(max - min, 1e-8)) * plotHeight;

  const candles = source.map((candle, index) => {
    const openY = y(candle.open);
    const closeY = y(candle.close);
    return {
      ...candle,
      x: PAD.left + step * index + step / 2,
      highY: y(candle.high),
      lowY: y(candle.low),
      bodyY: Math.min(openY, closeY),
      bodyHeight: Math.max(1.4, Math.abs(closeY - openY)),
      bodyWidth,
      up: candle.close >= candle.open,
    };
  });

  const gridY = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = max - (max - min) * ratio;
    return {
      y: PAD.top + plotHeight * ratio,
      label: value.toFixed(data.pricePrecision),
    };
  });

  return {
    candles,
    gridY,
    startLabel: source[0] ? chartTimeLabel(source[0].timestamp, data.timeframe) : "",
    endLabel: source.at(-1)
      ? chartTimeLabel(source.at(-1)!.timestamp, data.timeframe)
      : "",
  };
}

function chartTimeLabel(timestamp: number, timeframe: Timeframe): string {
  const date = new Date(timestamp);
  if (timeframe === "D1") {
    return (
      String(date.getUTCDate()).padStart(2, "0") +
      "/" +
      String(date.getUTCMonth() + 1).padStart(2, "0")
    );
  }

  return (
    String(date.getUTCHours()).padStart(2, "0") +
    ":" +
    String(date.getUTCMinutes()).padStart(2, "0")
  );
}
