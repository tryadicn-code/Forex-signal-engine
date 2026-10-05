"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PriceChartCandle, PriceChartResponse } from "@/types/chart";
import type { Timeframe } from "@/types/market";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIMEFRAMES: Timeframe[] = ["M15", "H1", "H4", "D1"];
const WIDTH = 900;
const HEIGHT = 380;
const PAD = { top: 18, right: 70, bottom: 28, left: 10 };

export function visibleBarsForWidth(width: number): number {
  if (width < 600) return 60;
  if (width < 1000) return 80;
  return 120;
}

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
  const [visibleBars, setVisibleBars] = useState(60);
  const chartContainerRef = useRef<HTMLDivElement>(null);

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
      });

    return () => controller.abort();
  }, [symbol, timeframe, asOf]);

  useEffect(() => {
    const element = chartContainerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (!width) return;
      const next = visibleBarsForWidth(width);
      setVisibleBars((current) => (current === next ? current : next));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
          <div className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
            {data?.candles.length
              ? formatPrice(symbol, data.candles[data.candles.length - 1].close)
              : "—"}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-600">
            {timeframe} · closed candles
          </div>
        </div>
      </div>

      <div
        ref={chartContainerRef}
        className="overflow-hidden rounded-md border border-zinc-800 bg-[#090c11]"
      >
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
          <CandlesSvg data={data} visibleBars={visibleBars} />
        ) : (
          <div className="flex h-72 items-center justify-center text-xs text-zinc-600">
            No closed candles available.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
        <span>
          {data ? Math.min(data.candles.length, visibleBars) : 0} visible · {data?.candles.length ?? 0} loaded
        </span>
        <span>
          {data?.source ? data.source.toUpperCase() + " provider" : "—"}
        </span>
      </div>
    </section>
  );
}

function CandlesSvg({
  data,
  visibleBars,
}: {
  data: PriceChartResponse;
  visibleBars: number;
}) {
  const model = useMemo(() => chartModel(data, visibleBars), [data, visibleBars]);
  const [hoveredTimestamp, setHoveredTimestamp] = useState<number | null>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);

  const activeCandle =
    model.candles.find((candle) => candle.timestamp === hoveredTimestamp) ??
    model.candles.find((candle) => candle.timestamp === selectedTimestamp) ??
    model.candles.at(-1) ??
    null;

  return (
    <div className="relative">
      {activeCandle && (
        <OhlcReadout
          candle={activeCandle}
          symbol={data.symbol}
          timeframe={data.timeframe}
        />
      )}

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
        className="block h-56 w-full touch-pan-y select-none sm:h-72 lg:h-80"
        preserveAspectRatio="xMidYMid meet"
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

        <line
          data-testid="current-price-line"
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={model.currentPriceY}
          y2={model.currentPriceY}
          stroke="#10b981"
          strokeWidth="1"
          strokeDasharray="5 4"
          opacity="0.75"
        />
        <rect
          x={WIDTH - PAD.right + 3}
          y={model.currentPriceY - 8}
          width={64}
          height={16}
          rx="3"
          fill="#064e3b"
        />
        <text
          x={WIDTH - PAD.right + 35}
          y={model.currentPriceY + 4}
          textAnchor="middle"
          fill="#a7f3d0"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          {model.currentPriceLabel}
        </text>

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

        {model.candles.map((candle) => (
          <rect
            key={"hit-" + candle.timestamp}
            data-candle-timestamp={candle.timestamp}
            x={candle.x - model.step / 2}
            y={PAD.top}
            width={model.step}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="transparent"
            onPointerEnter={() => setHoveredTimestamp(candle.timestamp)}
            onPointerLeave={() => setHoveredTimestamp(null)}
            onPointerDown={() =>
              setSelectedTimestamp((current) =>
                current === candle.timestamp ? null : candle.timestamp
              )
            }
          />
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
    </div>
  );
}

function OhlcReadout({
  candle,
  symbol,
  timeframe,
}: {
  candle: PriceChartCandle;
  symbol: string;
  timeframe: Timeframe;
}) {
  return (
    <div
      data-testid="chart-ohlc"
      aria-live="polite"
      className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap gap-x-2 gap-y-0.5 rounded border border-zinc-800/80 bg-[#090c11]/90 px-2 py-1 font-mono text-[11px] text-zinc-500 backdrop-blur sm:text-[11px]"
    >
      <span className="text-zinc-300">{chartTimeLabel(candle.timestamp, timeframe)}</span>
      <span>O <b className="font-medium text-zinc-300">{formatPrice(symbol, candle.open)}</b></span>
      <span>H <b className="font-medium text-emerald-300">{formatPrice(symbol, candle.high)}</b></span>
      <span>L <b className="font-medium text-rose-300">{formatPrice(symbol, candle.low)}</b></span>
      <span>C <b className="font-medium text-zinc-100">{formatPrice(symbol, candle.close)}</b></span>
    </div>
  );
}

function chartModel(data: PriceChartResponse, visibleBars: number) {
  const source = data.candles.slice(-visibleBars);
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
  const bodyWidth = Math.max(1.8, Math.min(8, step * 0.62));
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

  const currentPrice = source.at(-1)?.close ?? 0;

  return {
    candles,
    gridY,
    step,
    currentPriceY: y(currentPrice),
    currentPriceLabel: currentPrice.toFixed(data.pricePrecision),
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
