import {
  assertNotificationAdminSecret,
  readNotificationDashboard,
  retryNotificationDeliveries,
} from "@/server/notification-access";
import {
  errorResponse,
  okResponse,
  requireJsonBody,
} from "@/server/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // M8A-1: the dashboard exposes delivery state and possibly recipient
    // metadata. Require the same admin secret as POST.
    assertNotificationAdminSecret(
      request.headers.get("x-fse-alert-admin-secret")
    );
    return okResponse(await readNotificationDashboard());
  } catch (error) {
    return errorResponse(error, "Notification dashboard unavailable.");
  }
}

export async function POST(request: Request) {
  try {
    assertNotificationAdminSecret(
      request.headers.get("x-fse-alert-admin-secret")
    );
    requireJsonBody(request);

    let body: { action?: unknown };
    try {
      body = (await request.json()) as { action?: unknown };
    } catch {
      // M8A-4: a malformed JSON body is a client error, not "unsupported
      // action". Report it explicitly so the caller can fix the payload.
      return errorResponse(
        new Error("Request body must be valid JSON."),
        "Request body must be valid JSON.",
        { expose: true, statusOverride: 400 }
      );
    }

    if (body.action !== "retry-failed") {
      return errorResponse(
        new Error("Unsupported notification action."),
        "Unsupported notification action.",
        { expose: true, statusOverride: 400 }
      );
    }

    return okResponse({
      ok: true,
      ...(await retryNotificationDeliveries()),
    });
  } catch (error) {
    return errorResponse(error, "Notification retry failed.");
  }
}