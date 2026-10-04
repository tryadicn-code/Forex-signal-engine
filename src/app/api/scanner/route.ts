/**
 * Scanner API route (thin transport layer).
 *
 * GET  returns the current dashboard view without re-running analysis.
 * POST runs one fresh scan cycle (manual refresh) and returns the new view.
 *
 * H8A-G2-1: POST triggers a scan across the whole universe and burns provider
 * quota. It now requires the broker approval secret so only operators can
 * initiate a manual scan. GET stays public because the dashboard reads it
 * from the browser on every page load.
 *
 * No trading logic lives here: the route only forwards to scanner-access.
 */

import { NextResponse } from "next/server";
import { readDashboard, refreshScanner } from "@/server/scanner-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
} from "@/server/api-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readDashboard();
    return okResponse(data);
  } catch (error) {
    return errorResponse(error, "Scanner dashboard unavailable.");
  }
}

export async function POST(request: Request) {
  try {
    requireBrokerSecret(request);
    const data = await refreshScanner();
    return okResponse(data);
  } catch (error) {
    return errorResponse(error, "Scanner refresh failed.");
  }
}