import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bootedAt = Date.now();

/**
 * M8A-2: executionMode is now read from the process environment instead of
 * being hardcoded to "PAPER". Monitoring that routes on this field would
 * otherwise be misled when the engine runs in SIGNAL_ONLY or LIVE.
 */
function resolveExecutionMode(): "SIGNAL_ONLY" | "PAPER" | "LIVE" {
  const raw = (process.env.FSE_EXECUTION_MODE ?? "").trim().toUpperCase();
  if (raw === "LIVE" || raw === "PAPER" || raw === "SIGNAL_ONLY") return raw;
  return "SIGNAL_ONLY";
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      protocol: "phase-8-liveness-v1",
      bootedAt,
      now: Date.now(),
      uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
      executionMode: resolveExecutionMode(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}