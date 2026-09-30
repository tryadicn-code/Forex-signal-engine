import { NextResponse } from "next/server";
import {
  readPersistedBacktest,
  updatePersistedBacktestMetadata,
} from "@/server/backtest-access";

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


export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      label?: unknown;
      tags?: unknown;
    };

    const label =
      body.label === undefined
        ? undefined
        : typeof body.label === "string"
          ? body.label
          : null;
    const tags =
      body.tags === undefined
        ? undefined
        : Array.isArray(body.tags) &&
            body.tags.every((value) => typeof value === "string")
          ? (body.tags as string[])
          : null;

    if (label === null || tags === null) {
      return NextResponse.json(
        { ok: false, error: "Invalid backtest metadata payload." },
        { status: 400 }
      );
    }

    const artifact = await updatePersistedBacktestMetadata(id, {
      ...(label !== undefined ? { label } : {}),
      ...(tags !== undefined ? { tags } : {}),
    });

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
            : "Unable to update backtest metadata.",
      },
      { status: 400 }
    );
  }
}
