import {
  sharedTransactionalMode,
  transactionalStore,
} from "@/transactional/runtime";
import { errorResponse, okResponse } from "@/server/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = Number(url.searchParams.get("limit") ?? "50");
    const limit =
      Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 200) : 50;

    if (!sharedTransactionalMode()) {
      return okResponse({
        protocol: "phase-9-telemetry-v1",
        mode: "LOCAL",
        events: [],
      });
    }

    return okResponse({
      protocol: "phase-9-telemetry-v1",
      mode: "SHARED",
      events: await transactionalStore().recentTelemetry(limit),
    });
  } catch (error) {
    return errorResponse(error, "Telemetry unavailable.");
  }
}