import { NextResponse } from "next/server";
import { readPersistedBacktest } from "@/server/backtest-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const artifact = await readPersistedBacktest(id);
    if (!artifact) {
      return NextResponse.json(
        { ok: false, error: "Backtest report not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, artifact });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read backtest report.",
      },
      { status: 400 }
    );
  }
}
