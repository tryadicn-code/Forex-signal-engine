import { describe, expect, it, vi } from "vitest";
import { Mt5MarketDataProvider } from "@/providers/market-data/mt5-provider";

const AS_OF = Date.UTC(2026, 8, 29, 12, 0, 0);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Mt5MarketDataProvider", () => {
  it("normalizes bridge candles into canonical closed candles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        symbol: "EURUSD",
        resolvedSymbol: "EURUSD",
        timeframe: "H1",
        candles: [
          {
            timestamp: Date.UTC(2026, 8, 29, 9, 0, 0),
            open: 1.1700,
            high: 1.1720,
            low: 1.1690,
            close: 1.1710,
            volume: 120,
          },
          {
            timestamp: Date.UTC(2026, 8, 29, 10, 0, 0),
            open: 1.1710,
            high: 1.1730,
            low: 1.1700,
            close: 1.1720,
            volume: 140,
          },
        ],
      })
    );

    const provider = new Mt5MarketDataProvider(
      { bridgeUrl: "http://127.0.0.1:8765" },
      fetchMock
    );

    const result = await provider.getCandles({
      symbol: "EURUSD",
      timeframe: "H1",
      limit: 10,
      asOf: AS_OF,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      symbol: "EURUSD",
      timeframe: "H1",
      close: 1.171,
      volume: 120,
      source: "mt5",
      closed: true,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/candles?");
    expect(String(fetchMock.mock.calls[0][0])).toContain("timeframe=H1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("asOf=" + AS_OF);
  });

  it("derives midpoint and pip spread from bridge bid/ask", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        symbol: "EURUSD",
        resolvedSymbol: "EURUSD",
        bid: 1.17004,
        ask: 1.17016,
        price: 1.17010,
        timestamp: AS_OF - 1_000,
      })
    );

    const provider = new Mt5MarketDataProvider(
      { bridgeUrl: "http://127.0.0.1:8765" },
      fetchMock
    );
    const result = await provider.getLatestPrice("EURUSD", AS_OF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.price).toBeCloseTo(1.1701, 6);
    expect(result.data.spreadPips).toBeCloseTo(1.2, 6);
    expect(result.data.timestamp).toBe(AS_OF - 1_000);
  });

  it("uses JPY pip size when calculating bridge spread", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        symbol: "USDJPY",
        resolvedSymbol: "USDJPYm",
        bid: 149.501,
        ask: 149.521,
        price: 149.511,
        timestamp: AS_OF - 1_000,
      })
    );

    const provider = new Mt5MarketDataProvider({}, fetchMock);
    const result = await provider.getLatestPrice("USDJPY", AS_OF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.spreadPips).toBeCloseTo(2, 6);
  });

  it("fails closed when the local bridge is unavailable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const provider = new Mt5MarketDataProvider({}, fetchMock);

    const result = await provider.getLatestPrice("EURUSD", AS_OF);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(provider.getProviderStatus().state).toBe("DISCONNECTED");
  });

  it("rejects unsupported symbols before calling the bridge", async () => {
    const fetchMock = vi.fn();
    const provider = new Mt5MarketDataProvider({}, fetchMock);

    const result = await provider.getLatestPrice("NOTAPAIR", AS_OF);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SYMBOL_NOT_SUPPORTED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
