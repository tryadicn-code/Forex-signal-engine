import { describe, expect, it } from "vitest";
import {
  errorResponse,
  statusForError,
} from "@/server/api-guard";

/**
 * These tests pin the contract for the route handlers in Group 2. They do not
 * import the route handlers themselves (which would require heavy mocking)
 * but assert that the shared error policy they rely on behaves as expected.
 */
describe("grup 2 route error policy", () => {
  it("classifies unsupported symbol as 400", () => {
    // "Unsupported symbol." does not match the not-found/unknown/missing
    // regex, so it falls through to the generic 400. That is the right
    // classification: the caller sent a symbol the deployment does not
    // support, which is a client error, not a missing resource.
    expect(statusForError(new Error("Unsupported symbol."))).toBe(400);
  });

  it("classifies provider rate limit as 429 override", () => {
    const response = errorResponse(new Error("rate limited"), "fallback", {
      statusOverride: 429,
    });
    expect(response.status).toBe(429);
  });

  it("classifies auth failure as 401", () => {
    expect(
      statusForError(new Error("Approval secret is required."))
    ).toBe(401);
  });
});