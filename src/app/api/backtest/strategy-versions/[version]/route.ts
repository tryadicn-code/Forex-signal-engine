import {
  deprecateStrategyVersion,
  rollbackStrategyVersion,
} from "@/server/strategy-version-access";
import {
  errorResponse,
  isValidStrategyVersion,
  okResponse,
  requireBrokerSecret,
  requireJsonBody,
} from "@/server/api-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ version: string }> }
) {
  try {
    // C8A-4: this endpoint can DEPRECATE or ROLLBACK a live strategy version.
    // It previously accepted unauthenticated PATCH requests. Authentication
    // and a strict path format are now mandatory.
    requireBrokerSecret(request);
    requireJsonBody(request);

    const { version } = await context.params;
    const decodedVersion = decodeURIComponent(version);
    if (!isValidStrategyVersion(decodedVersion)) {
      return errorResponse(
        new Error("Invalid strategy version."),
        "Invalid strategy version.",
        { expose: true, statusOverride: 400 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const changedBy = requiredString(body.changedBy, "changedBy", 80);
    const reason = requiredString(body.reason, "reason", 1000);

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
              throw Object.assign(
                new Error(
                  "Only DEPRECATE or ROLLBACK lifecycle actions are supported here."
                ),
                { status: 400 }
              );
            })();

    return okResponse({ ok: true, registry });
  } catch (error) {
    return errorResponse(
      error,
      "Unable to update strategy version lifecycle."
    );
  }
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number
): string {
  if (typeof value !== "string" || !value.trim()) {
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