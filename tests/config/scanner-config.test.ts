import { describe, it, expect } from "vitest";
import {
  resolveScannerConfig,
  DEFAULT_SCANNER_CONFIG,
  DEFAULT_SYMBOL_UNIVERSE,
} from "@/config/scanner";

describe("resolveScannerConfig immutability", () => {
  it("returns a defensive copy, not the shared default", () => {
    const resolved = resolveScannerConfig();
    expect(resolved).not.toBe(DEFAULT_SCANNER_CONFIG);
    expect(resolved).toEqual(DEFAULT_SCANNER_CONFIG);
  });

  it("mutating a resolved top-level array does not leak into the default", () => {
    const resolved = resolveScannerConfig();
    resolved.symbols.push("INJECTED");
    expect(DEFAULT_SCANNER_CONFIG.symbols).not.toContain("INJECTED");
    expect(DEFAULT_SCANNER_CONFIG.symbols.length).toBe(DEFAULT_SYMBOL_UNIVERSE.length);
  });

  it("mutating a resolved nested object does not leak into the default", () => {
    const resolved = resolveScannerConfig();
    resolved.account.balance = 999;
    resolved.signalTtl.triggerBars = 99;
    resolved.freshness.freshBars = 99;
    resolved.timeframeRoles.setup = "M5";
    expect(DEFAULT_SCANNER_CONFIG.account.balance).toBe(10_000);
    expect(DEFAULT_SCANNER_CONFIG.signalTtl.triggerBars).toBe(3);
    expect(DEFAULT_SCANNER_CONFIG.freshness.freshBars).toBe(1.5);
    expect(DEFAULT_SCANNER_CONFIG.timeframeRoles.setup).toBe("H1");
  });

  it("two independent resolutions do not share mutable state", () => {
    const a = resolveScannerConfig();
    const b = resolveScannerConfig();
    expect(a).not.toBe(b);
    a.symbols.push("AAA");
    expect(b.symbols).not.toContain("AAA");
  });

  it("ships the hardened entry-quality defaults", () => {
    expect(DEFAULT_SCANNER_CONFIG.engineConfig.setup.minSetupScore).toBe(60);
    expect(DEFAULT_SCANNER_CONFIG.engineConfig.trigger.minTriggerScore).toBe(80);
    expect(DEFAULT_SCANNER_CONFIG.engineConfig.trigger.volumeLookback).toBe(20);
    expect(DEFAULT_SCANNER_CONFIG.engineConfig.trigger.volumeExpansionRatio).toBe(1.2);
    expect(DEFAULT_SCANNER_CONFIG.engineConfig.trigger.maxTriggerAgeBars).toBe(3);
  });

  it("applies scalar overrides without touching unrelated defaults", () => {
    const resolved = resolveScannerConfig({ candleLookback: 100 });
    expect(resolved.candleLookback).toBe(100);
    expect(resolved.providerId).toBe(DEFAULT_SCANNER_CONFIG.providerId);
    expect(resolved.account).toEqual(DEFAULT_SCANNER_CONFIG.account);
  });

  it("merges nested overrides onto the defaults", () => {
    const resolved = resolveScannerConfig({
      account: { balance: 50_000 },
      signalTtl: { setupBars: 12 },
    });
    expect(resolved.account.balance).toBe(50_000);
    // Unspecified nested keys are preserved from the defaults.
    expect(resolved.account.currency).toBe("USD");
    expect(resolved.account.riskPercent).toBe(0.5);
    expect(resolved.signalTtl.setupBars).toBe(12);
    expect(resolved.signalTtl.triggerBars).toBe(3);
  });

  it("replaces array overrides wholesale rather than merging indices", () => {
    const resolved = resolveScannerConfig({ symbols: ["EURUSD", "GBPUSD"] });
    expect(resolved.symbols).toEqual(["EURUSD", "GBPUSD"]);
    expect(DEFAULT_SCANNER_CONFIG.symbols.length).toBe(DEFAULT_SYMBOL_UNIVERSE.length);
  });

  it("ignores undefined overrides", () => {
    const resolved = resolveScannerConfig({ candleLookback: undefined });
    expect(resolved.candleLookback).toBe(DEFAULT_SCANNER_CONFIG.candleLookback);
  });
});
