import { NextRequest, NextResponse } from "next/server";
import {
  createRecoverySnapshot,
  listRecoverySnapshots,
  verifyRecoverySnapshot,
} from "@/server/recovery-snapshot-access";
import { sharedTransactionalMode } from "@/transactional/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const verify = request.nextUrl.searchParams.get("verify");
    if (verify) {
      return NextResponse.json({
        ok: true,
        verification: await verifyRecoverySnapshot(verify),
      });
    }

    return NextResponse.json({
      ok: true,
      snapshots: await listRecoverySnapshots(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read recovery snapshots.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (sharedTransactionalMode()) {
      throw new Error(
        "Local recovery snapshots are disabled in SHARED mode. Use PostgreSQL backup/PITR for authoritative recovery."
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const createdBy = requiredString(body.createdBy, "createdBy");
    const reason = requiredString(body.reason, "reason");
    return NextResponse.json(
      {
        ok: true,
        snapshot: await createRecoverySnapshot({
          createdBy,
          reason,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: message },
      {
        status:
          /maintenance mode|shared mode/i.test(message)
            ? 409
            : 400,
      }
    );
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(label + " is required.");
  }
  return value.trim();
}
