import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICE_ACTION_CONFIG,
} from "@/core/strategies/price-action/config";
import {
  PRICE_ACTION_STRATEGY,
  PRICE_ACTION_STRATEGY_ID,
} from "@/core/strategies/price-action";
import {
  IMPLEMENTED_STRATEGY_IDS,
} from "@/core/strategies/registry";

describe("PRICE_ACTION config", () => {
  it("default config punya EMA 20/50/200", () => {
    expect(DEFAULT_PRICE_ACTION_CONFIG.emaShort).toBe(20);
    expect(DEFAULT_PRICE_ACTION_CONFIG.emaMid).toBe(50);
    expect(DEFAULT_PRICE_ACTION_CONFIG.emaLong).toBe(200);
  });

  it("default enableTrendPullback + enableBreakoutRetest true", () => {
    expect(DEFAULT_PRICE_ACTION_CONFIG.enableTrendPullback).toBe(true);
    expect(DEFAULT_PRICE_ACTION_CONFIG.enableBreakoutRetest).toBe(true);
  });

  it("default enableReversal true (setelah reversal family ditambahkan)", () => {
    expect(DEFAULT_PRICE_ACTION_CONFIG.enableReversal).toBe(true);
  });
});

describe("PRICE_ACTION registry", () => {
  it("terdaftar di IMPLEMENTED_STRATEGY_IDS", () => {
    expect(IMPLEMENTED_STRATEGY_IDS).toContain("PRICE_ACTION");
  });

  it("strategy definition punya id PRICE_ACTION", () => {
    expect(PRICE_ACTION_STRATEGY.id).toBe(PRICE_ACTION_STRATEGY_ID);
    expect(PRICE_ACTION_STRATEGY.id).toBe("PRICE_ACTION");
  });

  it("strategy punya method analyze", () => {
    expect(typeof PRICE_ACTION_STRATEGY.analyze).toBe("function");
  });
});

describe("PRICE_ACTION router force override", () => {
  it("forceStrategyId memilih PRICE_ACTION saat available", async () => {
    const { routeStrategy } = await import("@/core/strategies/router");
    const regime = {
      status: "REGIME_TREND_DOWN",
      score: 60,
      confidence: 60,
      evidence: [],
      conflicts: [],
      data: {
        regime: "TREND_DOWN" as const,
        baseRegime: "TREND_DOWN" as const,
        direction: "SHORT" as const,
        strength: 60,
        adx: 30,
        ema20: 1.1,
        ema50: 1.12,
        ema200: 1.15,
        atr: 0.001,
        bandWidthRatio: 1.0,
      },
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const decision = routeStrategy(
      regime,
      ["TREND_PULLBACK", "PRICE_ACTION"],
      { forceStrategyId: "PRICE_ACTION" }
    );
    expect(decision.selectedStrategyId).toBe("PRICE_ACTION");
    expect(decision.reasonCode).toBe("FORCED_STRATEGY");
  });

  it("PRICE_ACTION hadir di availableStrategyIds TIDAK otomatis mengoverride routing", async () => {
    // Regression: TRD-RR-006. Kehadiran PRICE_ACTION di availableStrategyIds
    // tidak boleh menggantikan regime mapping. Hanya forceStrategyId
    // eksplisit yang boleh melakukannya.
    const { routeStrategy } = await import("@/core/strategies/router");
    const regime = {
      status: "REGIME_TREND_DOWN",
      score: 60,
      confidence: 60,
      evidence: [],
      conflicts: [],
      data: {
        regime: "TREND_DOWN" as const,
        baseRegime: "TREND_DOWN" as const,
        direction: "SHORT" as const,
        strength: 60,
        adx: 30,
        ema20: 1.1,
        ema50: 1.12,
        ema200: 1.15,
        atr: 0.001,
        bandWidthRatio: 1.0,
      },
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const decision = routeStrategy(
      regime,
      ["TREND_PULLBACK", "PRICE_ACTION"],
      {}
    );
    expect(decision.selectedStrategyId).toBe("TREND_PULLBACK");
    expect(decision.reasonCode).toBe("TREND_REGIME");
  });

  it("tanpa forceStrategyId, mapping regime tetap dipakai", async () => {
    const { routeStrategy } = await import("@/core/strategies/router");
    const regime = {
      status: "REGIME_TREND_DOWN",
      score: 60,
      confidence: 60,
      evidence: [],
      conflicts: [],
      data: {
        regime: "TREND_DOWN" as const,
        baseRegime: "TREND_DOWN" as const,
        direction: "SHORT" as const,
        strength: 60,
        adx: 30,
        ema20: 1.1,
        ema50: 1.12,
        ema200: 1.15,
        atr: 0.001,
        bandWidthRatio: 1.0,
      },
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    const decision = routeStrategy(
      regime,
      ["TREND_PULLBACK", "PRICE_ACTION"],
      {}
    );
    expect(decision.selectedStrategyId).toBe("TREND_PULLBACK");
  });
});