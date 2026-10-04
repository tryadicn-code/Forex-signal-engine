import { listPersistedBacktests } from "@/server/backtest-access";
import { errorResponse, okResponse } from "@/server/api-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("limit") ?? "20");
    const limit =
      Number.isInteger(requested) && requested > 0
        ? Math.min(requested, 50)
        : 20;

    const runs = await listPersistedBacktests(limit);
    return okResponse({ ok: true, runs });
  } catch (error) {
    return errorResponse(error, "Unable to list persisted backtests.");
  }
}