import { readBrokerExecutionDashboard } from "@/server/broker-execution-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecretOrDevOpen,
} from "@/server/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // H8A-G3-1: the broker dashboard exposes the live arm (who approved it,
    // when, how many orders remain), the kill-switch state, and every open
    // live position. Require the approval secret when configured; allow dev
    // without a secret.
    requireBrokerSecretOrDevOpen(request);
    return okResponse(await readBrokerExecutionDashboard());
  } catch (error) {
    return errorResponse(error, "Broker dashboard unavailable.");
  }
}