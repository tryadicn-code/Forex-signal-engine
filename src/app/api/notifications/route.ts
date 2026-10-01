import { NextResponse } from "next/server";
import {
  assertNotificationAdminSecret,
  readNotificationDashboard,
  retryNotificationDeliveries,
} from "@/server/notification-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readNotificationDashboard(), {
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

export async function POST(request: Request) {
  try {
    assertNotificationAdminSecret(
      request.headers.get("x-fse-alert-admin-secret")
    );
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
    };
    if (body.action !== "retry-failed") {
      throw new Error("Unsupported notification action.");
    }
    return NextResponse.json({
      ok: true,
      ...(await retryNotificationDeliveries()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }
}
