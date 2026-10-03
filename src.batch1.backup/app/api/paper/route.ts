import { NextResponse } from "next/server";
import {
  closePaperPosition,
  readPaperDashboard,
  resetPaperAccount,
} from "@/server/paper-trading-access";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readPaperDashboard());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      positionId?: string;
      initialBalance?: number;
    };

    if (body.action === "close-position") {
      if (
        typeof body.positionId !== "string" ||
        body.positionId.length === 0
      ) {
        return NextResponse.json(
          { error: "Invalid paper position." },
          { status: 400 }
        );
      }
      return NextResponse.json(await closePaperPosition(body.positionId));
    }

    if (body.action === "set-initial-balance") {
      if (
        typeof body.initialBalance !== "number" ||
        !Number.isFinite(body.initialBalance)
      ) {
        return NextResponse.json(
          { error: "Initial balance must be a valid number." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        await resetPaperAccount(body.initialBalance)
      );
    }

    return NextResponse.json(
      { error: "Invalid paper action." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Paper action failed.",
      },
      { status: 409 }
    );
  }
}

export async function DELETE() {
  return NextResponse.json(await resetPaperAccount());
}
