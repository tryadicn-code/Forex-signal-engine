import { migrateLocalStateToShared } from "@/production/phase9-migration-service";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
  requireJsonBody,
} from "@/server/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // C8A-1: migration mutates persistent state and must require the broker
    // approval secret. Previously it accepted any unauthenticated POST.
    requireBrokerSecret(request);
    requireJsonBody(request);

    const body = (await request.json()) as {
      createdBy?: unknown;
      reason?: unknown;
    };
    const createdBy =
      typeof body.createdBy === "string" ? body.createdBy.trim() : "";
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (!createdBy || createdBy.length > 80) {
      return errorResponse(
        new Error("createdBy is required and must be <= 80 characters."),
        "Invalid migration request.",
        { expose: true, statusOverride: 400 }
      );
    }
    if (!reason || reason.length > 1000) {
      return errorResponse(
        new Error("reason is required and must be <= 1000 characters."),
        "Invalid migration request.",
        { expose: true, statusOverride: 400 }
      );
    }

    const result = await migrateLocalStateToShared(createdBy, reason);
    return okResponse(result);
  } catch (error) {
    return errorResponse(error, "Unable to perform migration.");
  }
}