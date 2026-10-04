import {
  readReleaseRuntimeAudit,
  resolveRuntimeRelease,
} from "@/server/release-runtime-access";
import { errorResponse, okResponse } from "@/server/api-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const resolution = await resolveRuntimeRelease();
    const audit = await readReleaseRuntimeAudit();
    return okResponse({
      ok: true,
      state: resolution.state,
      audit,
    });
  } catch (error) {
    return errorResponse(error, "Unable to read release runtime state.");
  }
}