import { NextRequest } from "next/server";
import { SYMBOL_METADATA } from "@/config/scanner";
import { runtimeDefaultAsOf } from "@/server/runtime-market-data";
import { readPriceCandles } from "@/server/market-candles-access";
import type { Timeframe } from "@/types/market";
import { errorResponse, okResponse } from "@/server/api-guard";

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
    return errorResponse(
      new Error("Unsupported symbol."),
      "Unsupported symbol.",
      { expose: true, statusOverride: 400 }
    );
  }

  if (!CHART_TIMEFRAMES.has(timeframe)) {
    return errorResponse(
      new Error("Unsupported chart timeframe."),
      "Unsupported chart timeframe.",
      { expose: true, statusOverride: 400 }
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

  try {
    const result = await readPriceCandles({
      symbol,
      timeframe,
      limit,
      asOf,
    });

    if (!result.ok) {
      // M8A-G2-1: the provider message is intentionally NOT returned to the
      // caller. errorResponse() logs and sanitizes; the caller gets a generic
      // message plus the provider error code for programmatic handling.
      const status =
        result.error.code === "SYMBOL_NOT_SUPPORTED" ||
        result.error.code === "TIMEFRAME_NOT_SUPPORTED"
          ? 400
          : result.error.code === "RATE_LIMIT"
            ? 429
            : 503;
      return errorResponse(result.error, "Market data unavailable.", {
        statusOverride: status,
      });
    }

    return okResponse(result.data);
  } catch (error) {
    return errorResponse(error, "Unable to read candles.");
  }
}