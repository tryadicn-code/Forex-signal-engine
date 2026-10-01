import { describe, expect, it } from "vitest";
import { formatTime, formatTimeShort } from "@/lib/format";

describe("Bali time formatting", () => {
  it("renders UTC epochs in WITA (UTC+8)", () => {
    const epoch = Date.UTC(2026, 9, 1, 14, 54, 50);
    expect(formatTime(epoch)).toBe("22:54:50 WITA");
    expect(formatTimeShort(epoch)).toBe("22:54");
  });
});
