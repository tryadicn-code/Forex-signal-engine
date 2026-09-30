import { NextResponse } from "next/server";
import {
  readPersistedBacktest,
  updatePersistedBacktestMetadata,
  updatePersistedBacktestReleaseReview,
} from "@/server/backtest-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const artifact = await readPersistedBacktest(id);
    if (!artifact) {
      return NextResponse.json(
        { ok: false, error: "Backtest report not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, artifact });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read backtest report.",
      },
      { status: 400 }
    );
  }
}


export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      label?: unknown;
      tags?: unknown;
      releaseReview?: unknown;
    };

    const label =
      body.label === undefined
        ? undefined
        : typeof body.label === "string"
          ? body.label
          : null;
    const tags =
      body.tags === undefined
        ? undefined
        : Array.isArray(body.tags) &&
            body.tags.every((value) => typeof value === "string")
          ? (body.tags as string[])
          : null;

    if (label === null || tags === null) {
      return NextResponse.json(
        { ok: false, error: "Invalid backtest metadata payload." },
        { status: 400 }
      );
    }

    let artifact =
      label !== undefined || tags !== undefined
        ? await updatePersistedBacktestMetadata(id, {
            ...(label !== undefined ? { label } : {}),
            ...(tags !== undefined ? { tags } : {}),
          })
        : await readPersistedBacktest(id);

    if (!artifact) {
      return NextResponse.json(
        { ok: false, error: "Backtest report not found." },
        { status: 404 }
      );
    }

    if (body.releaseReview !== undefined) {
      if (
        typeof body.releaseReview !== "object" ||
        body.releaseReview === null
      ) {
        return NextResponse.json(
          { ok: false, error: "Invalid release review payload." },
          { status: 400 }
        );
      }

      const review = body.releaseReview as {
        decision?: unknown;
        reviewer?: unknown;
        note?: unknown;
        checklist?: unknown;
        forwardEvidence?: unknown;
      };
      const allowedDecisions = ["PENDING", "HOLD", "PROMOTE"];
      const checklist =
        typeof review.checklist === "object" && review.checklist !== null
          ? (review.checklist as Record<string, unknown>)
          : null;
      const allowedForwardStates = ["NOT_REVIEWED", "REVIEWED", "WAIVED"];

      if (
        typeof review.decision !== "string" ||
        !allowedDecisions.includes(review.decision) ||
        typeof review.reviewer !== "string" ||
        (review.note !== undefined && typeof review.note !== "string") ||
        checklist === null ||
        typeof checklist.datasetQualityReviewed !== "boolean" ||
        typeof checklist.assumptionsReviewed !== "boolean" ||
        typeof checklist.reproducibilityReviewed !== "boolean" ||
        typeof checklist.outOfSampleReviewed !== "boolean" ||
        typeof checklist.statisticsReviewed !== "boolean" ||
        typeof checklist.forwardPaper !== "string" ||
        !allowedForwardStates.includes(checklist.forwardPaper)
      ) {
        return NextResponse.json(
          { ok: false, error: "Invalid release review payload." },
          { status: 400 }
        );
      }

      artifact = await updatePersistedBacktestReleaseReview(id, {
        decision: review.decision as "PENDING" | "HOLD" | "PROMOTE",
        reviewer: review.reviewer,
        note: typeof review.note === "string" ? review.note : "",
        checklist: {
          datasetQualityReviewed: checklist.datasetQualityReviewed,
          assumptionsReviewed: checklist.assumptionsReviewed,
          reproducibilityReviewed: checklist.reproducibilityReviewed,
          outOfSampleReviewed: checklist.outOfSampleReviewed,
          statisticsReviewed: checklist.statisticsReviewed,
          forwardPaper: checklist.forwardPaper as
            | "NOT_REVIEWED"
            | "REVIEWED"
            | "WAIVED",
        },
        forwardEvidence:
          review.forwardEvidence === null ||
          review.forwardEvidence === undefined
            ? null
            : (review.forwardEvidence as never),
      });

      if (!artifact) {
        return NextResponse.json(
          { ok: false, error: "Backtest report not found." },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ ok: true, artifact });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update backtest metadata.",
      },
      { status: 400 }
    );
  }
}
