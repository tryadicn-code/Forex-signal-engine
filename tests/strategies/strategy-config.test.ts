import { describe, expect, it } from "vitest";
import {
  DEFAULT_STRATEGY_CONFIG,
  resolveStrategyConfig,
} from "@/core/strategies/config";

describe("Phase 12 multi-strategy configuration", () => {
  it("deeply applies one strategy override without mutating other strategies", () => {
    const resolved = resolveStrategyConfig({
      breakoutRetest: {
        minTriggerScore: 97,
      },
    });

    expect(resolved.breakoutRetest.minTriggerScore).toBe(97);
    expect(resolved.rangeMeanReversion.minTriggerScore).toBe(
      DEFAULT_STRATEGY_CONFIG.rangeMeanReversion.minTriggerScore
    );
    expect(resolved.reversal.minTriggerScore).toBe(
      DEFAULT_STRATEGY_CONFIG.reversal.minTriggerScore
    );
  });

  it("returns defensive copies instead of shared mutable defaults", () => {
    const first = resolveStrategyConfig();
    const second = resolveStrategyConfig();

    first.reversal.minTriggerScore = 99;

    expect(second.reversal.minTriggerScore).toBe(
      DEFAULT_STRATEGY_CONFIG.reversal.minTriggerScore
    );
    expect(DEFAULT_STRATEGY_CONFIG.reversal.minTriggerScore).toBe(90);
  });
});
