import { describe, expect, it } from "vitest";

/**
 * Mirrors the semantics of HistoricalExecutionSimulator.countSwapNights
 * without instantiating the full simulator. Keep this fixture and the
 * simulator method in sync.
 */
function countSwapNights(
  openedAt: number,
  closedAt: number,
  rolloverHourUtc: number,
  tripleSwapWeekday: number
): number {
  if (closedAt <= openedAt) return 0;
  const MS_PER_DAY = 86_400_000;
  const rolloverMs = rolloverHourUtc * 3_600_000;
  const firstK = Math.floor((openedAt - rolloverMs) / MS_PER_DAY) + 1;
  const lastK = Math.floor((closedAt - 1 - rolloverMs) / MS_PER_DAY);
  let nights = 0;
  for (let k = firstK; k <= lastK; k += 1) {
    const rolloverAt = k * MS_PER_DAY + rolloverMs;
    const day = new Date(rolloverAt).getUTCDay();
    nights += day === tripleSwapWeekday ? 3 : 1;
  }
  return nights;
}

// Epoch anchor: 2024-01-01 (Monday) 00:00:00 UTC
const MON_00 = Date.UTC(2024, 0, 1, 0, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("countSwapNights (H4-2 / M4-1)", () => {
  const rolloverHour = 21;
  const tripleDay = 3; // Wednesday

  it("counts 0 for zero-duration position", () => {
    expect(countSwapNights(MON_00 + 20 * HOUR, MON_00 + 20 * HOUR, rolloverHour, tripleDay)).toBe(0);
  });

  it("counts 0 when position closes before first rollover", () => {
    // Mon 20:00 -> Mon 20:59:59.999
    expect(
      countSwapNights(MON_00 + 20 * HOUR, MON_00 + 21 * HOUR - 1, rolloverHour, tripleDay)
    ).toBe(0);
  });

  it("counts 1 when position spans a single Monday rollover", () => {
    // Mon 20:00 -> Mon 22:00 (crosses Mon 21:00)
    expect(
      countSwapNights(MON_00 + 20 * HOUR, MON_00 + 22 * HOUR, rolloverHour, tripleDay)
    ).toBe(1);
  });

  it("counts 3 when rollover falls on Wednesday (triple swap)", () => {
    // Tue 22:00 -> Wed 22:00 (crosses Wed 21:00 only)
    const tue22 = MON_00 + DAY + 22 * HOUR;
    const wed22 = MON_00 + 2 * DAY + 22 * HOUR;
    expect(countSwapNights(tue22, wed22, rolloverHour, tripleDay)).toBe(3);
  });

  it("counts Mon+Tue+triple-Wed across three consecutive rollovers", () => {
    // Mon 20:00 -> Wed 22:00 -> Mon(1) + Tue(1) + Wed(3) = 5
    const mon20 = MON_00 + 20 * HOUR;
    const wed22 = MON_00 + 2 * DAY + 22 * HOUR;
    expect(countSwapNights(mon20, wed22, rolloverHour, tripleDay)).toBe(5);
  });

  it("excludes the rollover when opened exactly at it", () => {
    // Open Mon 21:00 exactly, close Tue 22:00 -> only Tue 21:00 counts = 1
    const mon21 = MON_00 + 21 * HOUR;
    const tue22 = MON_00 + DAY + 22 * HOUR;
    expect(countSwapNights(mon21, tue22, rolloverHour, tripleDay)).toBe(1);
  });

  it("excludes the rollover when closed exactly at it", () => {
    // Open Mon 20:00, close Tue 21:00 exactly -> only Mon 21:00 counts = 1
    const mon20 = MON_00 + 20 * HOUR;
    const tue21 = MON_00 + DAY + 21 * HOUR;
    expect(countSwapNights(mon20, tue21, rolloverHour, tripleDay)).toBe(1);
  });

  it("full week Mon 20:00 -> Sat 08:00 = 1+1+3+1+1 = 7 nights", () => {
    const mon20 = MON_00 + 20 * HOUR;
    const sat08 = MON_00 + 5 * DAY + 8 * HOUR;
    expect(countSwapNights(mon20, sat08, rolloverHour, tripleDay)).toBe(7);
  });
});