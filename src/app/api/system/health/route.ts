import { NextResponse } from "next/server";
import { readProductionHealth } from "@/server/production-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Health endpoint. Deliberately left without authentication so external
 * uptime monitoring can reach it. Every error message is sanitized even so,
 * because health endpoints are the most common accidental leak surface.
 */
export async function GET() {
  try {
    const health = await readProductionHealth();
    return NextResponse.json(health, {
      status: health.readiness === "BLOCKED" ? 503 : 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      {
        schemaVersion: 1,
        protocol: "phase-11-health-v1",
        readiness: "BLOCKED",
        error: "Production health check failed.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }
}