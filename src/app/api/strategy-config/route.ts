import {
  IMPLEMENTED_STRATEGY_IDS,
} from "@/core/strategies/registry";
import {
  readStrategyConfigState,
  saveStrategyConfig,
} from "@/server/strategy-config-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
  requireJsonBody,
} from "@/server/api-guard";
import type { ImplementedStrategyId } from "@/core/strategies/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readStrategyConfigState();
    return okResponse({
      available: [...IMPLEMENTED_STRATEGY_IDS],
      enabledStrategies: state.config.enabledStrategies,
      usedDefault: state.usedDefault,
      updatedAt: state.config.updatedAt,
    });
  } catch (error) {
    return errorResponse(error, "Strategy config unavailable.");
  }
}

export async function POST(request: Request) {
  try {
    requireBrokerSecret(request);
    requireJsonBody(request);

    const body = (await request.json()) as { enabledStrategies?: unknown };
    if (!Array.isArray(body.enabledStrategies)) {
      return errorResponse(
        new Error("enabledStrategies must be an array."),
        "Invalid payload.",
        { expose: true, statusOverride: 400 }
      );
    }

    const ids = body.enabledStrategies.filter(
      (entry): entry is string => typeof entry === "string"
    ) as ImplementedStrategyId[];

    try {
      const saved = await saveStrategyConfig(ids, "api");
      return okResponse({
        enabledStrategies: saved.enabledStrategies,
        updatedAt: saved.updatedAt,
      });
    } catch (validationError) {
      return errorResponse(
        validationError,
        "Strategy config rejected.",
        { expose: true, statusOverride: 400 }
      );
    }
  } catch (error) {
    return errorResponse(error, "Strategy config update failed.");
  }
}