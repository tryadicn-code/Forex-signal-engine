import { NextResponse } from "next/server";
import {
  armBrokerLiveExecution,
  assertBrokerApprovalSecret,
  disarmBrokerLiveExecution,
  setBrokerKillSwitch,
} from "@/server/broker-execution-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertBrokerApprovalSecret(
      request.headers.get("x-fse-approval-secret")
    );

    const body = (await request.json()) as Record<string, unknown>;
    const action = requiredString(body.action, "action");

    if (action === "kill-switch") {
      const engaged = body.engaged;
      if (typeof engaged !== "boolean") {
        throw new Error("engaged must be boolean.");
      }
      const state = await setBrokerKillSwitch({
        engaged,
        changedBy: requiredString(body.changedBy, "changedBy"),
        reason: requiredString(body.reason, "reason"),
      });
      return NextResponse.json({ ok: true, controls: state.controls });
    }

    if (action === "arm") {
      const arm = await armBrokerLiveExecution({
        approvedBy: requiredString(body.approvedBy, "approvedBy"),
        reason: requiredString(body.reason, "reason"),
        durationMinutes: optionalInteger(body.durationMinutes),
        maxOrders: optionalInteger(body.maxOrders),
      });
      return NextResponse.json({ ok: true, arm });
    }

    if (action === "disarm") {
      await disarmBrokerLiveExecution({
        changedBy: requiredString(body.changedBy, "changedBy"),
        reason: requiredString(body.reason, "reason"),
      });
      return NextResponse.json({ ok: true });
    }

    throw new Error("Unsupported broker control action.");
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

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(label + " is required.");
  }
  return value.trim();
}

function optionalInteger(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("Optional approval limits must be integers.");
  }
  return value;
}
