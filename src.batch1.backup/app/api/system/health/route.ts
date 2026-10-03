import { NextResponse } from "next/server";
import { readProductionHealth } from "@/server/production-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await readProductionHealth();
    return NextResponse.json(health, {
      status: health.readiness === "BLOCKED" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        schemaVersion: 1,
        protocol: "phase-11-health-v1",
        readiness: "BLOCKED",
        error:
          error instanceof Error
            ? error.message
            : "Production health check failed.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
