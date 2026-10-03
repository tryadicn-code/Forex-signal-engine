import { describe, it, expect } from "vitest";
import { isFxMarketOpen } from "@/replay/trading-hours";

function utc(year: number, month: number, day: number, hour: number, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute);
}

describe("B3-M1 trading hours", () => {
  it("opens on Monday morning", () => {
    expect(isFxMarketOpen(utc(2026, 1, 5, 8))).toBe(true); // Monday
  });

  it("opens on Friday before 22:00 UTC", () => {
    expect(isFxMarketOpen(utc(2026, 1, 9, 15))).toBe(true); // Friday 15:00
    expect(isFxMarketOpen(utc(2026, 1, 9, 21, 45))).toBe(true); // Friday 21:45
  });

  it("closes on Friday from 22:00 UTC", () => {
    expect(isFxMarketOpen(utc(2026, 1, 9, 22, 0))).toBe(false);
    expect(isFxMarketOpen(utc(2026, 1, 9, 23, 30))).toBe(false);
  });

  it("closes on Saturday all day", () => {
    expect(isFxMarketOpen(utc(2026, 1, 10, 0, 0))).toBe(false);
    expect(isFxMarketOpen(utc(2026, 1, 10, 12, 0))).toBe(false);
    expect(isFxMarketOpen(utc(2026, 1, 10, 23, 59))).toBe(false);
  });

  it("closes on Sunday before 21:00 UTC", () => {
    expect(isFxMarketOpen(utc(2026, 1, 11, 0, 0))).toBe(false);
    expect(isFxMarketOpen(utc(2026, 1, 11, 20, 59))).toBe(false);
  });

  it("opens on Sunday at 21:00 UTC", () => {
    expect(isFxMarketOpen(utc(2026, 1, 11, 21, 0))).toBe(true);
    expect(isFxMarketOpen(utc(2026, 1, 11, 22, 0))).toBe(true);
  });
});