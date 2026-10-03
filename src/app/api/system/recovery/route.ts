import { NextRequest } from "next/server";
import {
  createRecoverySnapshot,
  listRecoverySnapshots,
  verifyRecoverySnapshot,
} from "@/server/recovery-snapshot-access";
import { sharedTransactionalMode } from "@/transactional/runtime";
import {
  errorResponse,
  isValidSnapshotKey,
  okResponse,
  requireBrokerSecret,
  requireJsonBody,
} from "@/server/api-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const verify = request.nextUrl.searchParams.get("verify");
    if (verify) {
      // H8A-2: verify is user input and previously flowed straight into the
      // access layer. Restrict the format to what a snapshot key can contain
      // so a traversal payload like "../../etc/passwd" is rejected here.
      if (!isValidSnapshotKey(verify)) {
        return errorResponse(
          new Error("Invalid snapshot verification key."),
          "Invalid snapshot verification key.",
          { expose: true, statusOverride: 400 }
        );
      }
      return okResponse({
        ok: true,
        verification: await verifyRecoverySnapshot(verify),
      });
    }

    return okResponse({
      ok: true,
      snapshots: await listRecoverySnapshots(),
    });
  } catch (error) {
    return errorResponse(error, "Unable to read recovery snapshots.");
  }
}

export async function POST(request: NextRequest) {
  try {
    // C8A-2: recovery snapshots write to disk. Without authentication an
    // attacker could fill the disk, and could misattribute the snapshot by
    // setting createdBy to an operator name.
    requireBrokerSecret(request);
    requireJsonBody(request);

    if (sharedTransactionalMode()) {
      return errorResponse(
        new Error(
          "Local recovery snapshots are disabled in SHARED mode. Use PostgreSQL backup/PITR for authoritative recovery."
        ),
        "Local recovery snapshots are disabled in SHARED mode.",
        { expose: true, statusOverride: 409 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const createdBy = requiredString(body.createdBy, "createdBy", 80);
    const reason = requiredString(body.reason, "reason", 1000);

    return okResponse(
      {
        ok: true,
        snapshot: await createRecoverySnapshot({ createdBy, reason }),
      },
      201
    );
  } catch (error) {
    return errorResponse(error, "Unable to create recovery snapshot.");
  }
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw Object.assign(new Error(label + " is required."), { status: 400 });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw Object.assign(
      new Error(label + " must be " + maxLength + " characters or fewer."),
      { status: 400 }
    );
  }
  return trimmed;
}