import { describe, expect, it } from "vitest";
import {
  isValidBacktestId,
  isValidSnapshotKey,
  isValidStrategyVersion,
  publicErrorMessage,
  statusForError,
} from "@/server/api-guard";

describe("api-guard path validation", () => {
  it("accepts sane backtest ids", () => {
    expect(isValidBacktestId("abc-123_XYZ")).toBe(true);
    expect(isValidBacktestId("a")).toBe(true);
  });

  it("rejects path traversal in backtest ids", () => {
    expect(isValidBacktestId("../etc/passwd")).toBe(false);
    expect(isValidBacktestId("..%2Fetc")).toBe(false);
    expect(isValidBacktestId("a/b")).toBe(false);
    expect(isValidBacktestId("a\\b")).toBe(false);
    expect(isValidBacktestId("")).toBe(false);
    expect(isValidBacktestId("a".repeat(200))).toBe(false);
  });

  it("accepts semver-like strategy versions", () => {
    expect(isValidStrategyVersion("1.0.0")).toBe(true);
    expect(isValidStrategyVersion("phase-12.3")).toBe(true);
    expect(isValidStrategyVersion("v1.2.3-rc1")).toBe(true);
  });

  it("rejects traversal in strategy versions", () => {
    expect(isValidStrategyVersion("../../x")).toBe(false);
    expect(isValidStrategyVersion("1.0.0/../..")).toBe(false);
    expect(isValidStrategyVersion("")).toBe(false);
  });

  it("accepts alphanumeric snapshot keys", () => {
    expect(isValidSnapshotKey("snapshot-2024-01-01_12-00.json")).toBe(true);
  });

  it("rejects traversal in snapshot keys", () => {
    expect(isValidSnapshotKey("../../../etc/passwd")).toBe(false);
    expect(isValidSnapshotKey("a/b")).toBe(false);
  });
});

describe("api-guard error classification", () => {
  it("maps auth failures to 401", () => {
    expect(statusForError(new Error("Approval secret is invalid."))).toBe(401);
    expect(statusForError(new Error("Unauthorized."))).toBe(401);
  });

  it("maps not-found to 404", () => {
    expect(statusForError(new Error("Report not found."))).toBe(404);
  });

  it("maps shared-mode/maintenance to 409", () => {
    expect(statusForError(new Error("Disabled in SHARED mode."))).toBe(409);
  });

  it("maps connection failures to 503", () => {
    expect(statusForError(new Error("ECONNREFUSED"))).toBe(503);
    expect(statusForError(new Error("Connection timeout"))).toBe(503);
  });

  it("honors explicit status property", () => {
    const e = Object.assign(new Error("x"), { status: 422 });
    expect(statusForError(e)).toBe(422);
  });

  it("falls back to 400", () => {
    expect(statusForError(new Error("something else"))).toBe(400);
  });
});

describe("api-guard message sanitization", () => {
  it("hides the raw message by default", () => {
    const msg = publicErrorMessage(
      new Error("C:\\Users\\secret\\file.ts failed"),
      "Internal error."
    );
    expect(msg).toBe("Internal error.");
  });

  it("strips paths and env names when exposing", () => {
    const msg = publicErrorMessage(
      new Error("Failed at C:\\Users\\x\\file.ts with FSE_LIVE_APPROVAL_SECRET"),
      "fallback",
      true
    );
    expect(msg).not.toContain("C:\\Users");
    expect(msg).not.toContain("FSE_LIVE_APPROVAL_SECRET");
    expect(msg).toContain("<path>");
    expect(msg).toContain("<env>");
  });

  it("caps exposed message length", () => {
    const msg = publicErrorMessage(
      new Error("x".repeat(5000)),
      "fallback",
      true
    );
    expect(msg.length).toBeLessThanOrEqual(300);
  });
});