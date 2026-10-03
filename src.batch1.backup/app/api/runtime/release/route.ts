import { NextResponse } from "next/server";
import {
  readReleaseRuntimeAudit,
  resolveRuntimeRelease,
} from "@/server/release-runtime-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const resolution = await resolveRuntimeRelease();
    const audit = await readReleaseRuntimeAudit();
    return NextResponse.json({
      ok: true,
      state: resolution.state,
      audit,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read release runtime state.",
      },
      { status: 500 }
    );
  }
}
