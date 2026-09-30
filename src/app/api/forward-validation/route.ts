import { NextResponse } from "next/server";
import { readForwardValidationSnapshot } from "@/server/forward-validation-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      report: await readForwardValidationSnapshot(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to build forward validation report.",
      },
      { status: 500 }
    );
  }
}
