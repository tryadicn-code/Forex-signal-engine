import {
  readStrategyVersionRegistry,
  registerStrategyVersion,
} from "@/server/strategy-version-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
  requireJsonBody,
} from "@/server/api-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const registry = await readStrategyVersionRegistry();
    return okResponse({ ok: true, registry });
  } catch (error) {
    return errorResponse(error, "Unable to read strategy version registry.");
  }
}

export async function POST(request: Request) {
  try {
    // C8A-G3-1: registering a strategy version is a control mutation that
    // determines which versions can be armed for live execution. It must
    // require the broker approval secret. The business layer already
    // enforces decision === "PROMOTE" on the source report; this adds the
    // missing authorization boundary.
    requireBrokerSecret(request);
    requireJsonBody(request);

    const body = (await request.json()) as Record<string, unknown>;
    const version = requiredString(body.version, "version", 32);
    const registeredBy = requiredString(body.registeredBy, "registeredBy", 80);
    const sourceReportId = requiredString(
      body.sourceReportId,
      "sourceReportId",
      80
    );
    const title = optionalString(body.title, "title", 120);
    const note = optionalString(body.note, "note", 2000);
    const supersedesVersion = optionalString(
      body.supersedesVersion,
      "supersedesVersion",
      32
    );

    const registry = await registerStrategyVersion({
      version,
      registeredBy,
      sourceReportId,
      ...(title !== undefined ? { title } : {}),
      ...(note !== undefined ? { note } : {}),
      ...(supersedesVersion !== undefined ? { supersedesVersion } : {}),
    });
    return okResponse({ ok: true, registry });
  } catch (error) {
    return errorResponse(error, "Unable to register strategy version.");
  }
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(new Error(label + " is required."), { status: 400 });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw Object.assign(
      new Error(label + " must be " + maxLength + " characters or fewer."),
      { status: 400 }
    );
  }
  return trimmed;
}

function optionalString(
  value: unknown,
  label: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw Object.assign(new Error(label + " must be a string."), {
      status: 400,
    });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw Object.assign(
      new Error(label + " must be " + maxLength + " characters or fewer."),
      { status: 400 }
    );
  }
  return trimmed;
}