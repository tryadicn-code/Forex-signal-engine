import { NextResponse } from "next/server";
import {
  assertBrokerApprovalSecret,
  reconcileBrokerExecutions,
} from "@/server/broker-execution-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertBrokerApprovalSecret(
      request.headers.get("x-fse-approval-secret")
    );
    const reconciled = await reconcileBrokerExecutions();
    return NextResponse.json({ ok: true, reconciled });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }
}
