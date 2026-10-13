import { describe, it, expect } from "vitest";
import { classifyObstacle } from "@/core/risk/obstacle-classifier";

const base = {
  entry: 100,
  stop: 99,
  direction: "LONG" as const,
  minRR: 2,
  minObstacleR: 0.5,
  closeObstacleMaxR: 1,
  obstaclePolicyEnabled: true,
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

  it("returns BLOCK when obstacle below 0.5R", () => {
    // obstaclePrice 100.4 => obstacleR 0.4
    const plan = classifyObstacle({ ...base, obstaclePrice: 100.4 });
    expect(plan.kind).toBe("BLOCK");
    if (plan.kind === "BLOCK") {
      expect(plan.obstacleR).toBeCloseTo(0.4, 5);
      expect(plan.reason).toBe("RR_TOO_LOW_OBSTACLE");
    }
  });

  it("returns FULL_OBSTACLE at exactly 0.5R (boundary)", () => {
    const plan = classifyObstacle({ ...base, obstaclePrice: 100.5 });
    expect(plan.kind).toBe("FULL_OBSTACLE");
    if (plan.kind === "FULL_OBSTACLE") {
      expect(plan.obstacleR).toBeCloseTo(0.5, 5);
      expect(plan.tp).toBe(100.5);
    }
  });

  it("returns FULL_OBSTACLE for obstacle in (0.5R, 1R)", () => {
    // obstaclePrice 100.7 => obstacleR 0.7
    const plan = classifyObstacle({ ...base, obstaclePrice: 100.7 });
    expect(plan.kind).toBe("FULL_OBSTACLE");
    if (plan.kind === "FULL_OBSTACLE") {
      expect(plan.tp).toBe(100.7);
    }
  });

  it("returns FULL_2R (downgrade) at 1R when partial disabled", () => {
    const plan = classifyObstacle({ ...base, obstaclePrice: 101 });
    expect(plan.kind).toBe("FULL_2R");
    if (plan.kind === "FULL_2R") {
      expect(plan.obstacleR).toBeCloseTo(1, 5);
    }
  });

  it("returns PARTIAL for obstacle in [1R, 2R) when partial enabled", () => {
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
    }
  });

  it("returns PARTIAL at exactly 1R boundary (partial enabled)", () => {
    const plan = classifyObstacle({
      ...base,
      partialTPEnabled: true,
      obstaclePrice: 101,
    });
    expect(plan.kind).toBe("PARTIAL");
  });

  it("returns FULL_2R at exactly 2R boundary", () => {
    const plan = classifyObstacle({
      ...base,
      partialTPEnabled: true,
      obstaclePrice: 102,
    });
    expect(plan.kind).toBe("FULL_2R");
  });

  it("returns FULL_2R when obstacle >= 2R", () => {
    const plan = classifyObstacle({ ...base, obstaclePrice: 103 });
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

  it("handles SHORT FULL_OBSTACLE below entry", () => {
    const plan = classifyObstacle({
      ...base,
      direction: "SHORT",
      entry: 100,
      stop: 101,
      obstaclePrice: 99.4,
    });
    expect(plan.kind).toBe("FULL_OBSTACLE");
    if (plan.kind === "FULL_OBSTACLE") {
      expect(plan.tp).toBe(99.4);
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