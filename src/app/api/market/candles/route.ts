import { NextRequest, NextResponse } from "next/server";
import { SYMBOL_METADATA } from "@/config/scanner";
import { runtimeDefaultAsOf } from "@/server/runtime-market-data";
import { readPriceCandles } from "@/server/market-candles-access";
import type { Timeframe } from "@/types/market";

export const dynamic = "force-dynamic";

const CHART_TIMEFRAMES = new Set<Timeframe>(["M15", "H1", "H4", "D1"]);
const DEFAULT_LIMIT = 200;
const MIN_LIMIT = 50;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = (params.get("symbol") ?? "").trim().toUpperCase();
  const timeframe = (params.get("timeframe") ?? "H1") as Timeframe;

  if (!SYMBOL_METADATA[symbol]) {
    return NextResponse.json(
      { error: "Unsupported symbol." },
      { status: 400 }
    );
  }

  if (!CHART_TIMEFRAMES.has(timeframe)) {
    return NextResponse.json(
      { error: "Unsupported chart timeframe." },
      { status: 400 }
    );
  }

  const requestedLimit = Number(params.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(requestedLimit)))
    : DEFAULT_LIMIT;

  const fallbackAsOf = runtimeDefaultAsOf();
  const requestedAsOf = Number(params.get("asOf") ?? fallbackAsOf);
  const asOf =
    Number.isFinite(requestedAsOf) && requestedAsOf > 0
      ? requestedAsOf
      : fallbackAsOf;

  const result = await readPriceCandles({
    symbol,
    timeframe,
    limit,
    asOf,
  });

  if (!result.ok) {
    const status =
      result.error.code === "SYMBOL_NOT_SUPPORTED" ||
      result.error.code === "TIMEFRAME_NOT_SUPPORTED"
        ? 400
        : result.error.code === "RATE_LIMIT"
          ? 429
          : 503;

    return NextResponse.json(
      {
        error: result.error.message,
        code: result.error.code,
      },
      { status }
    );
  }

  return NextResponse.json(result.data);
}
