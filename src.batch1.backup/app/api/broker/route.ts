import { NextResponse } from "next/server";
import { readBrokerExecutionDashboard } from "@/server/broker-execution-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readBrokerExecutionDashboard(), {
      headers: { "Cache-Control": "no-store" },
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
