import { NextResponse } from "next/server";
import {
  deprecateStrategyVersion,
  rollbackStrategyVersion,
} from "@/server/strategy-version-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ version: string }> }
) {
  try {
    const { version } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const changedBy = requiredString(body.changedBy, "changedBy");
    const reason = requiredString(body.reason, "reason");
    const decodedVersion = decodeURIComponent(version);

    const registry =
      body.action === "DEPRECATE"
        ? await deprecateStrategyVersion({
            version: decodedVersion,
            changedBy,
            reason,
          })
        : body.action === "ROLLBACK"
          ? await rollbackStrategyVersion({
              version: decodedVersion,
              changedBy,
              reason,
            })
          : (() => {
              throw new Error(
                "Only DEPRECATE or ROLLBACK lifecycle actions are supported here."
              );
            })();
    return NextResponse.json({ ok: true, registry });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update strategy version lifecycle.",
      },
      { status: 400 }
    );
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(label + " is required.");
  }
  return value.trim();
}
