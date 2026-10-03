import { NextResponse } from "next/server";
import { listPersistedBacktests } from "@/server/backtest-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("limit") ?? "20");
  const limit =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, 50)
      : 20;

  try {
    const runs = await listPersistedBacktests(limit);
    return NextResponse.json({ ok: true, runs });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to list persisted backtests.",
      },
      { status: 500 }
    );
  }
}
