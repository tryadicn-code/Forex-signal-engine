import { describe, expect, it } from "vitest";
import { DEFAULT_PAPER_TRADING_CONFIG } from "@/config/paper";
import {
  PAPER_CONFIG_VERSION,
  defaultPaperConfigState,
  resolvePaperConfigState,
  toEditable,
  toPaperTradingConfig,
  validatePaperConfig,
} from "@/core/config/paper-config";

describe("toEditable / toPaperTradingConfig", () => {
  it("roundtrip preserves editable fields", () => {
    const editable = toEditable(DEFAULT_PAPER_TRADING_CONFIG);
    const back = toPaperTradingConfig(editable);
    expect(back.maxOpenPositions).toBe(DEFAULT_PAPER_TRADING_CONFIG.maxOpenPositions);
    expect(back.maxTotalOpenRiskPercent).toBe(
      DEFAULT_PAPER_TRADING_CONFIG.maxTotalOpenRiskPercent
    );
    expect(back.stopLossReentryCooldownMs).toBe(
      DEFAULT_PAPER_TRADING_CONFIG.stopLossReentryCooldownMs
    );
    expect(back.intrabarConflictPolicy).toBe(
      DEFAULT_PAPER_TRADING_CONFIG.intrabarConflictPolicy
    );
  });

  it("stopLossReentryCooldownMinutes dikonversi ke ms", () => {
    const cfg = toPaperTradingConfig({
      ...toEditable(DEFAULT_PAPER_TRADING_CONFIG),
      stopLossReentryCooldownMinutes: 30,
    });
    expect(cfg.stopLossReentryCooldownMs).toBe(30 * 60_000);
  });
});

describe("defaultPaperConfigState", () => {
  it("pakai DEFAULT_PAPER_TRADING_CONFIG", () => {
    const state = defaultPaperConfigState(1000);
    expect(state.version).toBe(PAPER_CONFIG_VERSION);
    expect(state.updatedAt).toBe(1000);
    expect(state.config.maxOpenPositions).toBe(
      DEFAULT_PAPER_TRADING_CONFIG.maxOpenPositions
    );
  });
});

describe("validatePaperConfig", () => {
  const valid = defaultPaperConfigState(1000);

  it("menerima config valid", () => {
    const result = validatePaperConfig(valid);
    expect(result.ok).toBe(true);
  });

  it("menolak non-object", () => {
    expect(validatePaperConfig("string").ok).toBe(false);
    expect(validatePaperConfig(null).ok).toBe(false);
  });

  it("menolak config.config bukan object", () => {
    expect(validatePaperConfig({ config: "x" }).ok).toBe(false);
  });

  it("menolak maxOpenPositions di luar range", () => {
    const bad = { ...valid, config: { ...valid.config, maxOpenPositions: 0 } };
    const result = validatePaperConfig(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("maxOpenPositions");
  });

  it("menolak maxOpenPositions > 50", () => {
    const bad = { ...valid, config: { ...valid.config, maxOpenPositions: 51 } };
    expect(validatePaperConfig(bad).ok).toBe(false);
  });

  it("menolak maxTotalOpenRiskPercent > 100", () => {
    const bad = {
      ...valid,
      config: { ...valid.config, maxTotalOpenRiskPercent: 101 },
    };
    expect(validatePaperConfig(bad).ok).toBe(false);
  });

  it("menolak intrabarConflictPolicy invalid", () => {
    const bad = {
      ...valid,
      config: { ...valid.config, intrabarConflictPolicy: "INVALID" },
    };
    expect(validatePaperConfig(bad).ok).toBe(false);
  });

  it("menolak allowDelayed bukan boolean", () => {
    const bad = { ...valid, config: { ...valid.config, allowDelayed: "yes" } };
    expect(validatePaperConfig(bad).ok).toBe(false);
  });

  it("menolak autoScanEnabled bukan boolean", () => {
    const bad = { ...valid, config: { ...valid.config, autoScanEnabled: 1 } };
    expect(validatePaperConfig(bad).ok).toBe(false);
  });

  it("menolak number non-finite", () => {
    const bad = {
      ...valid,
      config: { ...valid.config, maxOpenPositions: NaN },
    };
    expect(validatePaperConfig(bad).ok).toBe(false);
  });
});

describe("resolvePaperConfigState", () => {
  it("valid -> usedDefault false", () => {
    const state = defaultPaperConfigState(1000);
    const out = resolvePaperConfigState(state);
    expect(out.usedDefault).toBe(false);
    expect(out.state.config.maxOpenPositions).toBe(
      DEFAULT_PAPER_TRADING_CONFIG.maxOpenPositions
    );
  });

  it("invalid -> fallback + usedDefault true", () => {
    const out = resolvePaperConfigState({ config: {} });
    expect(out.usedDefault).toBe(true);
    expect(out.state.config.maxOpenPositions).toBe(
      DEFAULT_PAPER_TRADING_CONFIG.maxOpenPositions
    );
  });
});