import { describe, expect, it } from "vitest";
import { createRuntimeMarketDataProvider, resolveRuntimeProviderId, resolveRuntimeSymbols } from "@/providers/market-data/runtime-provider";
import { MockMarketDataProvider } from "@/providers/market-data/mock-provider";
import { OandaMarketDataProvider } from "@/providers/market-data/oanda-provider";
import { Mt5MarketDataProvider } from "@/providers/market-data/mt5-provider";

describe("runtime market-data provider selection", () => {
  it("defaults to mock when MARKET_DATA_PROVIDER is absent", () => {
    expect(resolveRuntimeProviderId({})).toBe("mock");
    expect(createRuntimeMarketDataProvider({ env: {} })).toBeInstanceOf(
      MockMarketDataProvider
    );
  });

  it("selects OANDA only when explicitly configured", () => {
    const env = {
      MARKET_DATA_PROVIDER: "oanda",
      OANDA_API_TOKEN: "test-token",
      OANDA_ACCOUNT_ID: "test-account",
      OANDA_ENVIRONMENT: "practice",
    };

    expect(resolveRuntimeProviderId(env)).toBe("oanda");
    expect(createRuntimeMarketDataProvider({ env })).toBeInstanceOf(
      OandaMarketDataProvider
    );
  });

  it("selects MT5 only when explicitly configured", () => {
    const env = {
      MARKET_DATA_PROVIDER: "mt5",
      MT5_BRIDGE_URL: "http://127.0.0.1:8765",
    };

    expect(resolveRuntimeProviderId(env)).toBe("mt5");
    expect(createRuntimeMarketDataProvider({ env })).toBeInstanceOf(
      Mt5MarketDataProvider
    );
  });

  it("parses and validates a staged scanner universe override", () => {
    expect(
      resolveRuntimeSymbols({
        SCANNER_SYMBOLS: "eurusd, USDJPY, eurusd, UNKNOWN",
      })
    ).toEqual(["EURUSD", "USDJPY"]);
    expect(resolveRuntimeSymbols({})).toBeUndefined();
  });

  it("does not silently treat unknown provider ids as live", () => {
    expect(resolveRuntimeProviderId({ MARKET_DATA_PROVIDER: "unknown" })).toBe(
      "mock"
    );
  });
});
