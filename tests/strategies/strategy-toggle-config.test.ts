import { describe, expect, it } from "vitest";
import {
  IMPLEMENTED_STRATEGY_IDS,
} from "@/core/strategies/registry";
import {
  STRATEGY_CONFIG_VERSION,
  defaultStrategyConfig,
  resolveStrategyConfig,
  validateStrategyConfig,
} from "@/core/strategies/strategy-config";

describe("defaultStrategyConfig", () => {
  it("mengaktifkan semua implemented strategy", () => {
    const config = defaultStrategyConfig(1000);
    expect(config.version).toBe(STRATEGY_CONFIG_VERSION);
    expect(config.updatedAt).toBe(1000);
    expect(config.enabledStrategies).toEqual([...IMPLEMENTED_STRATEGY_IDS]);
  });
});

describe("validateStrategyConfig", () => {
  it("menerima config valid", () => {
    const result = validateStrategyConfig({
      version: 1,
      updatedAt: 1000,
      enabledStrategies: ["TREND_PULLBACK"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.enabledStrategies).toEqual(["TREND_PULLBACK"]);
    }
  });

  it("menolak non-object", () => {
    const result = validateStrategyConfig("not-an-object");
    expect(result.ok).toBe(false);
  });

  it("menolak kalau enabledStrategies bukan array", () => {
    const result = validateStrategyConfig({
      enabledStrategies: "TREND_PULLBACK",
    });
    expect(result.ok).toBe(false);
  });

  it("menolak entry yang bukan string", () => {
    const result = validateStrategyConfig({
      enabledStrategies: [123],
    });
    expect(result.ok).toBe(false);
  });

  it("menolak strategy ID yang tidak dikenal", () => {
    const result = validateStrategyConfig({
      enabledStrategies: ["UNKNOWN_STRATEGY"],
    });
    expect(result.ok).toBe(false);
  });

  it("menolak list kosong", () => {
    const result = validateStrategyConfig({ enabledStrategies: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("minimal 1");
    }
  });

  it("dedupe duplikat dengan urutan pertama dipertahankan", () => {
    const result = validateStrategyConfig({
      enabledStrategies: [
        "BREAKOUT_RETEST",
        "TREND_PULLBACK",
        "BREAKOUT_RETEST",
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.enabledStrategies).toEqual([
        "BREAKOUT_RETEST",
        "TREND_PULLBACK",
      ]);
    }
  });

  it("default version kalau tidak ada", () => {
    const result = validateStrategyConfig({
      enabledStrategies: ["TREND_PULLBACK"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.version).toBe(STRATEGY_CONFIG_VERSION);
    }
  });

  it("default updatedAt kalau tidak ada", () => {
    const before = Date.now();
    const result = validateStrategyConfig({
      enabledStrategies: ["TREND_PULLBACK"],
    });
    const after = Date.now();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result.config.updatedAt).toBeLessThanOrEqual(after);
    }
  });
});

describe("resolveStrategyConfig", () => {
  it("valid input -> usedDefault false", () => {
    const out = resolveStrategyConfig({
      enabledStrategies: ["TREND_PULLBACK"],
    });
    expect(out.usedDefault).toBe(false);
    expect(out.config.enabledStrategies).toEqual(["TREND_PULLBACK"]);
  });

  it("invalid input -> fallback + usedDefault true", () => {
    const out = resolveStrategyConfig({ enabledStrategies: [] });
    expect(out.usedDefault).toBe(true);
    expect(out.config.enabledStrategies).toEqual([...IMPLEMENTED_STRATEGY_IDS]);
  });
});