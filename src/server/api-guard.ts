/**
 * Shared guards for API route handlers.
 *
 * Batch 8A created this module after finding four routes that performed
 * control mutations without authentication. The helpers here centralize:
 *
 *  - Secret extraction and timing-safe verification
 *  - Path parameter format validation (defeats traversal and enumeration)
 *  - Body size limits
 *  - Error classification (4xx vs 5xx) with sanitized public messages
 *  - Cache-Control / nosniff header policy
 *
 * Every route handler that mutates state should call `guardMutation()` first.
 * Read-only routes should at least validate path params and use the error
 * helpers.
 */

import { NextResponse } from "next/server";
import { assertBrokerApprovalSecret } from "@/server/broker-execution-access";

export type SecretKind = "broker" | "notifications";

export const MAX_JSON_BODY_BYTES = 64 * 1024;

/**
 * Read the approval secret from the request headers.
 *
 * Broker mutations use `x-fse-approval-secret`. Notification retries use
 * `x-fse-alert-admin-secret`. The header choice is decided by the caller so
 * that route handlers stay explicit about which authority they require.
 */
export function readBrokerApprovalSecret(request: Request): string | null {
  return request.headers.get("x-fse-approval-secret");
}

/**
 * DEV-ONLY bypass: when FSE_DEV_DISABLE_AUTH=true, all mutation endpoints
 * skip the approval-secret check. This is intended for local development
 * only and MUST NOT be set in a production environment.
 */
export function isAuthDisabled(): boolean {
  return (process.env.FSE_DEV_DISABLE_AUTH ?? "").trim().toLowerCase() === "true";
}

let warnedAuthDisabled = false;

export function requireBrokerSecret(request: Request): void {
  if (isAuthDisabled()) {
    if (!warnedAuthDisabled) {
      warnedAuthDisabled = true;
      console.warn(
        "[api-guard] FSE_DEV_DISABLE_AUTH=true — approval secret check is DISABLED. Do not use in production."
      );
    }
    return;
  }
  assertBrokerApprovalSecret(readBrokerApprovalSecret(request));
}

/**
 * Soft variant for GET endpoints that expose operational state but must keep
 * working in a local development session where no secret is configured.
 *
 *   - No secret configured in production -> refuse (fail closed).
 *   - No secret configured outside production -> allow (dev convenience).
 *   - Secret configured -> require a matching header.
 */
export function requireBrokerSecretOrDevOpen(request: Request): void {
  if (isAuthDisabled()) {
    return;
  }
  const expected = (process.env.FSE_LIVE_APPROVAL_SECRET ?? "").trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FSE_LIVE_APPROVAL_SECRET is not configured; refusing to serve operational state in production."
      );
    }
    return;
  }
  assertBrokerApprovalSecret(readBrokerApprovalSecret(request));
}

/**
 * Path parameter format validators.
 *
 * Path params are user input. Without a strict format check, an id can
 * contain `../` or `%2e%2e%2f` and reach any file that the access layer
 * joins into a path. The pattern here is deliberately narrow: only ASCII
 * letters, digits, underscore, dot and dash. No slashes, no percent-encoding.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const VERSION_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const SNAPSHOT_KEY_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * N8A-1: reject "." and ".." explicitly. They pass the character class
 * because "." is allowed, but they would resolve to the current or parent
 * directory when joined into a path. No legitimate identifier has that shape.
 */
function isNotDotSegment(value: string): boolean {
  return value !== "." && value !== "..";
}

export function isValidBacktestId(id: string): boolean {
  return isNotDotSegment(id) && ID_PATTERN.test(id);
}

export function isValidStrategyVersion(version: string): boolean {
  return isNotDotSegment(version) && VERSION_PATTERN.test(version);
}

export function isValidSnapshotKey(key: string): boolean {
  return isNotDotSegment(key) && SNAPSHOT_KEY_PATTERN.test(key);
}

/**
 * Classify an error into an HTTP status code.
 *
 * Authentication failures become 401. Validation errors become 400. Anything
 * that looks like an infrastructure problem becomes 500 or 503. This is a
 * best-effort mapping; callers can override by throwing an object with a
 * `status` property.
 */
export function statusForError(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 600) {
      return status;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/approval secret|authorization|unauthorized|forbidden/i.test(message)) {
    return 401;
  }
  if (/not found|unknown|missing/i.test(message)) {
    return 404;
  }
  if (/maintenance|shared mode|disabled|blocked/i.test(message)) {
    return 409;
  }
  if (/unavailable|timeout|connection|ECONN|disconnected/i.test(message)) {
    return 503;
  }
  return 400;
}

/**
 * Sanitize an error message for public response.
 *
 * H8A-1: internal error messages were returned verbatim. That leaked file
 * paths, environment variable names, and configuration state. This helper
 * returns a short generic message unless the caller opts in to the raw
 * message via `expose: true` (which they should only do for explicit
 * user-facing validation errors).
 */
export function publicErrorMessage(
  error: unknown,
  fallback: string,
  expose = false
): string {
  if (!expose) return fallback;
  const message = error instanceof Error ? error.message : String(error);
  // Strip anything that looks like a filesystem path or env var name.
  const sanitized = message
    .replace(/[A-Za-z]:\\[^\s"']+/g, "<path>")
    .replace(/\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+/g, "<path>")
    .replace(/FSE_[A-Z_]+/g, "<env>")
    .replace(/MT5_[A-Z_]+/g, "<env>");
  return sanitized.slice(0, 300);
}

/** Standard JSON error response with the right status and cache headers. */
export function errorResponse(
  error: unknown,
  fallback: string,
  options: { expose?: boolean; statusOverride?: number } = {}
): NextResponse {
  const status = options.statusOverride ?? statusForError(error);
  return NextResponse.json(
    {
      ok: false,
      error: publicErrorMessage(error, fallback, options.expose ?? false),
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

/** Standard JSON success response with cache headers. */
export function okResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Reject bodies larger than `MAX_JSON_BODY_BYTES`. Caller invokes before
 * request.json() to avoid buffering giant payloads.
 */
export function requireJsonBody(request: Request): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw Object.assign(
      new Error("Content-Type must be application/json."),
      { status: 415 }
    );
  }
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > MAX_JSON_BODY_BYTES) {
      throw Object.assign(
        new Error("Request body exceeds the maximum allowed size."),
        { status: 413 }
      );
    }
  }
}