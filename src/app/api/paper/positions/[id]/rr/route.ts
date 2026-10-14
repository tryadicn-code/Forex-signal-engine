import { updatePaperPositionRR } from "@/server/paper-trading-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
  requireJsonBody,
} from "@/server/api-guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireBrokerSecret(request);
    requireJsonBody(request);

    const { id } = await params;
    if (!id || typeof id !== "string") {
      return errorResponse(
        new Error("Position id is required."),
        "Invalid position id.",
        { expose: true, statusOverride: 400 }
      );
    }

    const body = (await request.json()) as { rr?: unknown };
    if (typeof body.rr !== "number" || !Number.isFinite(body.rr)) {
      return errorResponse(
        new Error("rr must be a finite number."),
        "Invalid payload.",
        { expose: true, statusOverride: 400 }
      );
    }

    try {
      const data = await updatePaperPositionRR(
        decodeURIComponent(id),
        body.rr
      );
      return okResponse(data);
    } catch (validationError) {
      return errorResponse(
        validationError,
        "Position RR update rejected.",
        { expose: true, statusOverride: 400 }
      );
    }
  } catch (error) {
    return errorResponse(error, "Position RR update failed.");
  }
}