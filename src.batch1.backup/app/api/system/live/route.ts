import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bootedAt = Date.now();

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      protocol: "phase-8-liveness-v1",
      bootedAt,
      now: Date.now(),
      uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
      executionMode: "PAPER",
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
