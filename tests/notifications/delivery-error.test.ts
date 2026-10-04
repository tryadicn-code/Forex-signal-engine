import { describe, expect, it } from "vitest";
import { NotificationDeliveryError } from "@/notifications/types";

describe("NotificationDeliveryError", () => {
  it("is an Error subclass with the right name", () => {
    const err = new NotificationDeliveryError("boom");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("NotificationDeliveryError");
    expect(err.message).toBe("boom");
    expect(err.retryAfterMs).toBeNull();
    expect(err.httpStatus).toBeNull();
    expect(err.requestId).toBeNull();
  });

  it("carries retryAfterMs, httpStatus, and requestId", () => {
    const err = new NotificationDeliveryError(
      "rate limited",
      60_000,
      429,
      "req-abc"
    );
    expect(err.retryAfterMs).toBe(60_000);
    expect(err.httpStatus).toBe(429);
    expect(err.requestId).toBe("req-abc");
  });

  it("is distinguishable from a plain Error", () => {
    const plain: unknown = new Error("generic");
    const typed: unknown = new NotificationDeliveryError("structured");
    expect(plain instanceof NotificationDeliveryError).toBe(false);
    expect(typed instanceof NotificationDeliveryError).toBe(true);
  });
});