import {
  readPaperConfigState,
  savePaperConfig,
} from "@/server/paper-config-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
  requireJsonBody,
} from "@/server/api-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { state, usedDefault } = await readPaperConfigState();
    return okResponse({
      version: state.version,
      updatedAt: state.updatedAt,
      config: state.config,
      usedDefault,
    });
  } catch (error) {
    return errorResponse(error, "Paper config unavailable.");
  }
}

export async function POST(request: Request) {
  try {
    requireBrokerSecret(request);
    requireJsonBody(request);

    const body = (await request.json()) as { config?: unknown };
    if (!body.config || typeof body.config !== "object") {
      return errorResponse(
        new Error("config object is required."),
        "Invalid payload.",
        { expose: true, statusOverride: 400 }
      );
    }

    try {
      const saved = await savePaperConfig(
        body.config as Parameters<typeof savePaperConfig>[0],
        "api"
      );
      return okResponse({
        version: saved.version,
        updatedAt: saved.updatedAt,
        config: saved.config,
      });
    } catch (validationError) {
      return errorResponse(
        validationError,
        "Paper config rejected.",
        { expose: true, statusOverride: 400 }
      );
    }
  } catch (error) {
    return errorResponse(error, "Paper config update failed.");
  }
}