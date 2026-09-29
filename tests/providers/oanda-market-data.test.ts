import { describe, expect, it, vi } from "vitest";
import {
  OandaMarketDataProvider,
  parseOandaTime,
  toOandaGranularity,
  toOandaInstrument,
} from "@/providers/market-data/oanda-provider";

const AS_OF = Date.UTC(2026, 8, 29, 12, 0, 0);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OandaMarketDataProvider", () => {
  it("maps canonical symbols and timeframes to OANDA identifiers", () => {
    expect(toOandaInstrument("EURUSD")).toBe("EUR_USD");
    expect(toOandaInstrument("USDJPY")).toBe("USD_JPY");
    expect(toOandaInstrument("NOPE")).toBeNull();
    expect(toOandaGranularity("M15")).toBe("M15");
    expect(toOandaGranularity("H4")).toBe("H4");
    expect(toOandaGranularity("D1")).toBe("D");
  });

  it("parses OANDA nanosecond timestamps safely", () => {
    expect(parseOandaTime("2026-09-29T10:00:00.123456789Z")).toBe(
      Date.parse("2026-09-29T10:00:00.123Z")
    );
  });

  it("normalizes completed OANDA midpoint candles into canonical candles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        instrument: "EUR_USD",
        granularity: "H1",
        candles: [
          {
            complete: true,
            volume: 120,
            time: "2026-09-29T09:00:00.000000000Z",
            mid: { o: "1.17000", h: "1.17200", l: "1.16900", c: "1.17100" },
          },
          {
            complete: true,
            volume: 140,
            time: "2026-09-29T10:00:00.000000000Z",
            mid: { o: "1.17100", h: "1.17300", l: "1.17000", c: "1.17200" },
          },
          {
            complete: false,
            volume: 50,
            time: "2026-09-29T11:00:00.000000000Z",
            mid: { o: "1.17200", h: "1.17400", l: "1.17100", c: "1.17300" },
          },
        ],
      })
    );

    const provider = new OandaMarketDataProvider(
      {
        token: "test-token",
        accountId: "test-account",
        environment: "practice",
      },
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
      open: 1.17,
      high: 1.172,
      low: 1.169,
      close: 1.171,
      source: "oanda",
      closed: true,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/v3/instruments/EUR_USD/candles?"
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain("granularity=H1");
  });

  it("derives an as-of midpoint and spread from completed bid/ask candles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        instrument: "EUR_USD",
        granularity: "M1",
        candles: [
          {
            complete: true,
            time: "2026-09-29T11:58:00.000000000Z",
            mid: { o: "1.17000", h: "1.17020", l: "1.16990", c: "1.17010" },
            bid: { o: "1.16994", h: "1.17014", l: "1.16984", c: "1.17004" },
            ask: { o: "1.17006", h: "1.17026", l: "1.16996", c: "1.17016" },
          },
        ],
      })
    );

    const provider = new OandaMarketDataProvider(
      { token: "test-token", accountId: "test-account" },
      fetchMock
    );
    const result = await provider.getLatestPrice("EURUSD", AS_OF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.price).toBeCloseTo(1.1701, 6);
    expect(result.data.spreadPips).toBeCloseTo(1.2, 6);
    expect(result.data.timestamp).toBe(
      Date.parse("2026-09-29T11:58:00.000Z")
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain("price=MBA");
  });

  it("maps OANDA rate limiting to the provider RATE_LIMIT error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ errorMessage: "rate limit exceeded" }, 429)
    );
    const provider = new OandaMarketDataProvider(
      { token: "test-token", accountId: "test-account" },
      fetchMock
    );

    const result = await provider.getCandles({
      symbol: "EURUSD",
      timeframe: "H1",
      limit: 50,
      asOf: AS_OF,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("RATE_LIMIT");
    expect(provider.getProviderStatus().state).toBe("DEGRADED");
  });

  it("fails closed when credentials are missing", async () => {
    const provider = new OandaMarketDataProvider();
    const result = await provider.getLatestPrice("EURUSD");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("CONFIG_ERROR");
    expect(provider.getProviderStatus().state).toBe("DISCONNECTED");
  });
});
