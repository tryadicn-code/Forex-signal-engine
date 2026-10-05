import {
  readSignalFunnelDashboard,
  resetSignalFunnelStore,
} from "@/server/signal-funnel-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
} from "@/server/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  -- current funnel dashboard view (read-only, no secret required).
 * DELETE -- wipe every stored observation. Requires the broker approval
 *          secret, mirroring every other mutation endpoint.
 */
export async function GET() {
  try {
    const view = await readSignalFunnelDashboard();
    return okResponse(view);
  } catch (error) {
    return errorResponse(error, "Signal funnel dashboard unavailable.");
  }
}

export async function DELETE(request: Request) {
  try {
    requireBrokerSecret(request);
    await resetSignalFunnelStore();
    return okResponse({ ok: true });
  } catch (error) {
    return errorResponse(error, "Signal funnel reset failed.");
  }
}