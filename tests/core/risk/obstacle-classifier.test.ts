import { describe, it, expect } from "vitest";
import { classifyObstacle } from "@/core/risk/obstacle-classifier";

const base = {
  entry: 100,
  stop: 99,
  direction: "LONG" as const,
  minRR: 2,
  minObstacleR: 1,
  partialTP1SizePercent: 50,
  partialTPEnabled: false,
  obstaclePrice: undefined as number | undefined,
};

describe("classifyObstacle", () => {
  it("returns FULL_2R when no obstacle", () => {
    const plan = classifyObstacle({ ...base });
    expect(plan.kind).toBe("FULL_2R");
    if (plan.kind === "FULL_2R") {
      expect(plan.tp).toBeCloseTo(102, 5);
    }
  });

  it("returns BLOCK when obstacle below 1R", () => {
    const plan = classifyObstacle({ ...base, obstaclePrice: 100.5 });
    expect(plan.kind).toBe("BLOCK");
    if (plan.kind === "BLOCK") {
      expect(plan.obstacleR).toBeCloseTo(0.5, 5);
      expect(plan.reason).toBe("RR_TOO_LOW_OBSTACLE");
    }
  });

  it("returns FULL_2R (downgrade) when partial disabled and obstacle 1R-2R", () => {
    const plan = classifyObstacle({ ...base, obstaclePrice: 101.5 });
    expect(plan.kind).toBe("FULL_2R");
    if (plan.kind === "FULL_2R") {
      expect(plan.obstacleR).toBeCloseTo(1.5, 5);
    }
  });

  it("returns PARTIAL when partial enabled and obstacle 1R-2R", () => {
    const plan = classifyObstacle({
      ...base,
      partialTPEnabled: true,
      obstaclePrice: 101.5,
    });
    expect(plan.kind).toBe("PARTIAL");
    if (plan.kind === "PARTIAL") {
      expect(plan.tp1).toBe(101.5);
      expect(plan.tp2).toBeCloseTo(102, 5);
      expect(plan.tp1SizePercent).toBe(50);
      expect(plan.tp2SizePercent).toBe(50);
      expect(plan.obstacleR).toBeCloseTo(1.5, 5);
    }
  });

  it("returns FULL_2R when obstacle >= 2R", () => {
    const plan = classifyObstacle({ ...base, obstaclePrice: 103 });
    expect(plan.kind).toBe("FULL_2R");
  });

  it("treats obstacle exactly at 1R as PARTIAL boundary", () => {
    const plan = classifyObstacle({
      ...base,
      partialTPEnabled: true,
      obstaclePrice: 101,
    });
    expect(plan.kind).toBe("PARTIAL");
  });

  it("treats obstacle exactly at 2R as FULL_2R boundary", () => {
    const plan = classifyObstacle({
      ...base,
      partialTPEnabled: true,
      obstaclePrice: 102,
    });
    expect(plan.kind).toBe("FULL_2R");
  });

  it("treats wrong-side obstacle as no obstacle (SHORT)", () => {
    const plan = classifyObstacle({
      ...base,
      direction: "SHORT",
      entry: 100,
      stop: 101,
      obstaclePrice: 101.5,
    });
    expect(plan.kind).toBe("FULL_2R");
    if (plan.kind === "FULL_2R") {
      expect(plan.obstaclePrice).toBeUndefined();
    }
  });

  it("handles SHORT baseline target", () => {
    const plan = classifyObstacle({
      ...base,
      direction: "SHORT",
      entry: 100,
      stop: 101,
      obstaclePrice: undefined,
    });
    expect(plan.kind).toBe("FULL_2R");
    if (plan.kind === "FULL_2R") {
      expect(plan.tp).toBeCloseTo(98, 5);
    }
  });

  it("degenerate stop -> FULL_2R with tp=entry", () => {
    const plan = classifyObstacle({ ...base, entry: 100, stop: 100 });
    expect(plan.kind).toBe("FULL_2R");
    if (plan.kind === "FULL_2R") {
      expect(plan.tp).toBe(100);
    }
  });
});