import { describe, expect, it } from "vitest";
import type { StructureResultData, SwingPoint } from "@/types/engine";
import { deriveStructuralTargetLevels } from "@/core/risk/structural-targets";

function swing(price: number, kind: "high" | "low", index: number): SwingPoint {
  return {
    index,
    timestamp: index,
    price,
    kind,
    confirmedAtIndex: index + 3,
    confirmedAtTimestamp: index + 3,
  };
}

function structure(
  highs: number[],
  lows: number[]
): StructureResultData {
  const swingHighs = highs.map((price, index) => swing(price, "high", index));
  const swingLows = lows.map((price, index) => swing(price, "low", index));
  return {
    trend: "NEUTRAL",
    swingHighs,
    swingLows,
    lastSwingHigh: swingHighs.at(-1) ?? null,
    lastSwingLow: swingLows.at(-1) ?? null,
    lastBOS: null,
    lastCHOCH: null,
    structurePoints: [],
    breakEvents: [],
    trendStrength: 0,
    equalHighs: [],
    equalLows: [],
  };
}

describe("deriveStructuralTargetLevels", () => {
  it("returns nearest buffered overhead swing levels for LONG", () => {
    const levels = deriveStructuralTargetLevels({
      entry: 1.1,
      direction: "LONG",
      pipSize: 0.0001,
      setupStructure: structure([1.105, 1.112], [1.09]),
      biasStructure: structure([1.108], [1.08]),
      bufferPips: 2,
    });

    expect(levels).toEqual([
      1.1048,
      1.1078,
      1.1118,
    ]);
  });

  it("returns nearest buffered downside swing levels for SHORT", () => {
    const levels = deriveStructuralTargetLevels({
      entry: 1.1,
      direction: "SHORT",
      pipSize: 0.0001,
      setupStructure: structure([1.12], [1.095, 1.088]),
      bufferPips: 2,
    });

    expect(levels).toEqual([1.0952, 1.0882]);
  });

  it("drops structural levels on the wrong side of entry", () => {
    const levels = deriveStructuralTargetLevels({
      entry: 1.1,
      direction: "LONG",
      pipSize: 0.0001,
      setupStructure: structure([1.099], [1.09]),
      bufferPips: 2,
    });

    expect(levels).toEqual([]);
  });
});
