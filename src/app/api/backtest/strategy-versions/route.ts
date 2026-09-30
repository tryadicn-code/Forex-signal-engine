import { NextResponse } from "next/server";
import {
  readStrategyVersionRegistry,
  registerStrategyVersion,
} from "@/server/strategy-version-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const registry = await readStrategyVersionRegistry();
    return NextResponse.json({ ok: true, registry });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read strategy version registry.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const version = requiredString(body.version, "version");
    const registeredBy = requiredString(body.registeredBy, "registeredBy");
    const sourceReportId = requiredString(
      body.sourceReportId,
      "sourceReportId"
    );
    const title = optionalString(body.title, "title");
    const note = optionalString(body.note, "note");
    const supersedesVersion = optionalString(
      body.supersedesVersion,
      "supersedesVersion"
    );

    const registry = await registerStrategyVersion({
      version,
      registeredBy,
      sourceReportId,
      ...(title !== undefined ? { title } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(supersedesVersion !== undefined ? { supersedesVersion } : {}),
    });
    return NextResponse.json({ ok: true, registry });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to register strategy version.",
      },
      { status: 400 }
    );
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(label + " is required.");
  }
  return value.trim();
}

function optionalString(
  value: unknown,
  label: string
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(label + " must be a string.");
  }
  return value.trim();
}
