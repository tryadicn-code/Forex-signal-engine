import { NextResponse } from "next/server";
import {
  readPaperDashboard,
  resetPaperAccount,
} from "@/server/paper-trading-access";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readPaperDashboard());
}

export async function DELETE() {
  return NextResponse.json(await resetPaperAccount());
}
