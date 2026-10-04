import { readForwardValidationSnapshot } from "@/server/forward-validation-access";
import { errorResponse, okResponse } from "@/server/api-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return okResponse({
      ok: true,
      report: await readForwardValidationSnapshot(),
    });
  } catch (error) {
    return errorResponse(error, "Unable to build forward validation report.");
  }
}