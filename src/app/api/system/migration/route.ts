import { NextResponse } from "next/server";
import { migrateLocalStateToShared } from "@/production/phase9-migration-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      createdBy?: unknown;
      reason?: unknown;
    };
    const result = await migrateLocalStateToShared(
      typeof body.createdBy === "string" ? body.createdBy : "",
      typeof body.reason === "string" ? body.reason : ""
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 409 }
    );
  }
}
