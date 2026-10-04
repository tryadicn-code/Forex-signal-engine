import {
  closePaperPosition,
  readPaperDashboard,
  resetPaperAccount,
} from "@/server/paper-trading-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
  requireBrokerSecretOrDevOpen,
  requireJsonBody,
} from "@/server/api-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // H8A-G3-2: the paper dashboard reveals strategy performance, open
    // positions and trade history. Require the approval secret when it is
    // configured; allow dev without a secret.
    requireBrokerSecretOrDevOpen(request);
    return okResponse(await readPaperDashboard());
  } catch (error) {
    return errorResponse(error, "Unable to read paper dashboard.");
  }
}

export async function POST(request: Request) {
  try {
    // C8A-G3-2: paper actions mutate account state and manually close
    // positions. Authentication is mandatory.
    requireBrokerSecret(request);
    requireJsonBody(request);

    const body = (await request.json()) as {
      action?: string;
      positionId?: string;
      initialBalance?: number;
    };

    if (body.action === "close-position") {
      if (
        typeof body.positionId !== "string" ||
        body.positionId.length === 0 ||
        body.positionId.length > 128
      ) {
        return errorResponse(
          new Error("Invalid paper position."),
          "Invalid paper position.",
          { expose: true, statusOverride: 400 }
        );
      }
      return okResponse(await closePaperPosition(body.positionId));
    }

    if (body.action === "set-initial-balance") {
      if (
        typeof body.initialBalance !== "number" ||
        !Number.isFinite(body.initialBalance) ||
        body.initialBalance <= 0 ||
        body.initialBalance > 1_000_000_000
      ) {
        return errorResponse(
          new Error("Initial balance must be a positive finite number <= 1e9."),
          "Invalid initial balance.",
          { expose: true, statusOverride: 400 }
        );
      }
      return okResponse(await resetPaperAccount(body.initialBalance));
    }

    return errorResponse(
      new Error("Invalid paper action."),
      "Invalid paper action.",
      { expose: true, statusOverride: 400 }
    );
  } catch (error) {
    return errorResponse(error, "Paper action failed.");
  }
}

export async function DELETE(request: Request) {
  try {
    requireBrokerSecret(request);
    return okResponse(await resetPaperAccount());
  } catch (error) {
    return errorResponse(error, "Unable to reset paper account.");
  }
}