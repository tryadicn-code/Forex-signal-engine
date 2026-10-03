import { NextResponse } from "next/server";
import type {
  ComparablePerformance,
  HistoricalForwardComparison,
} from "@/replay/analytics-types";
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
        forwardEvidence: parseForwardEvidence(review.forwardEvidence),
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


function parseForwardEvidence(value: unknown): {
  capturedAt: number;
  comparison: HistoricalForwardComparison;
} | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid Forward Paper evidence payload.");
  }

  const input = value as Record<string, unknown>;
  if (
    typeof input.capturedAt !== "number" ||
    !Number.isFinite(input.capturedAt) ||
    typeof input.comparison !== "object" ||
    input.comparison === null
  ) {
    throw new Error("Invalid Forward Paper evidence payload.");
  }

  const comparison = input.comparison as Record<string, unknown>;
  return {
    capturedAt: input.capturedAt,
    comparison: {
      historical: parseComparablePerformance(
        comparison.historical,
        "historical"
      ),
      forward: parseComparablePerformance(comparison.forward, "forward"),
      delta: parseComparisonDelta(comparison.delta),
    },
  };
}

function parseComparablePerformance(
  value: unknown,
  label: string
): ComparablePerformance {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid " + label + " comparison metrics.");
  }
  const input = value as Record<string, unknown>;
  return {
    sampleSize: requiredFiniteNumber(input.sampleSize, label + ".sampleSize"),
    winRate: nullableFiniteNumber(input.winRate, label + ".winRate"),
    profitFactor: nullableFiniteNumber(
      input.profitFactor,
      label + ".profitFactor"
    ),
    expectancyR: nullableFiniteNumber(
      input.expectancyR,
      label + ".expectancyR"
    ),
    averageR: nullableFiniteNumber(input.averageR, label + ".averageR"),
    maxDrawdownPercent: requiredFiniteNumber(
      input.maxDrawdownPercent,
      label + ".maxDrawdownPercent"
    ),
    netReturnPercent: requiredFiniteNumber(
      input.netReturnPercent,
      label + ".netReturnPercent"
    ),
  };
}

function parseComparisonDelta(
  value: unknown
): HistoricalForwardComparison["delta"] {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid comparison delta.");
  }
  const input = value as Record<string, unknown>;
  return {
    sampleSize: requiredFiniteNumber(input.sampleSize, "delta.sampleSize"),
    winRate: nullableFiniteNumber(input.winRate, "delta.winRate"),
    profitFactor: nullableFiniteNumber(
      input.profitFactor,
      "delta.profitFactor"
    ),
    expectancyR: nullableFiniteNumber(
      input.expectancyR,
      "delta.expectancyR"
    ),
    averageR: nullableFiniteNumber(input.averageR, "delta.averageR"),
    maxDrawdownPercent: requiredFiniteNumber(
      input.maxDrawdownPercent,
      "delta.maxDrawdownPercent"
    ),
    netReturnPercent: requiredFiniteNumber(
      input.netReturnPercent,
      "delta.netReturnPercent"
    ),
  };
}

function requiredFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(label + " must be a finite number.");
  }
  return value;
}

function nullableFiniteNumber(
  value: unknown,
  label: string
): number | null {
  if (value === null) return null;
  return requiredFiniteNumber(value, label);
}
