import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYMBOL_UNIVERSE,
  SUPPORTED_SYMBOL_UNIVERSE,
  normalizeSupportedSymbol,
} from "@/config/scanner";

describe("scanner symbol catalog", () => {
  it("keeps the existing 13-pair baseline while exposing optional crosses", () => {
    expect(DEFAULT_SYMBOL_UNIVERSE).toHaveLength(13);
    expect(SUPPORTED_SYMBOL_UNIVERSE.length).toBeGreaterThan(13);
    expect(DEFAULT_SYMBOL_UNIVERSE.every((symbol) =>
      SUPPORTED_SYMBOL_UNIVERSE.includes(symbol as never)
    )).toBe(true);
  });

  it("normalizes supported pair input and rejects unknown instruments", () => {
    expect(normalizeSupportedSymbol(" eur/chf ")).toBe("EURCHF");
    expect(normalizeSupportedSymbol("EURCHF")).toBe("EURCHF");
    expect(normalizeSupportedSymbol("XAUUSD")).toBeNull();
    expect(normalizeSupportedSymbol("UNKNOWN")).toBeNull();
  });
});
