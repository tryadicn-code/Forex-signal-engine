import { describe, expect, it } from "vitest";
import { createRuntimeMarketDataProvider, resolveRuntimeProviderId } from "@/providers/market-data/runtime-provider";
import { MockMarketDataProvider } from "@/providers/market-data/mock-provider";
import { OandaMarketDataProvider } from "@/providers/market-data/oanda-provider";

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

  it("does not silently treat unknown provider ids as live", () => {
    expect(resolveRuntimeProviderId({ MARKET_DATA_PROVIDER: "unknown" })).toBe(
      "mock"
    );
  });
});
