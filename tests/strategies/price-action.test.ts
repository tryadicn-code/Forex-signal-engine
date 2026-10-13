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

  it("default enableReversal false (MVP)", () => {
    expect(DEFAULT_PRICE_ACTION_CONFIG.enableReversal).toBe(false);
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