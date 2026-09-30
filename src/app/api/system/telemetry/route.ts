import { NextResponse } from "next/server";
import {
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = Number(url.searchParams.get("limit") ?? "50");
    const limit =
      Number.isInteger(parsed) && parsed > 0
        ? Math.min(parsed, 200)
        : 50;

    if (!sharedTransactionalMode()) {
      return NextResponse.json({
        protocol: "phase-9-telemetry-v1",
        mode: "LOCAL",
        events: [],
      });
    }

    return NextResponse.json({
      protocol: "phase-9-telemetry-v1",
      mode: "SHARED",
      events: await transactionalStore().recentTelemetry(limit),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
