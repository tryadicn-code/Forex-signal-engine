/**
 * Scanner API route (thin transport layer).
 *
 * GET  returns the current dashboard view without re-running analysis.
 * POST runs one fresh scan cycle (manual refresh) and returns the new view.
 *
 * No trading logic lives here: the route only forwards to scanner-access.
 */

import { NextResponse } from "next/server";
import { readDashboard, refreshScanner } from "@/server/scanner-access";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readDashboard();
  return NextResponse.json(data);
}

export async function POST() {
  const data = await refreshScanner();
  return NextResponse.json(data);
}
