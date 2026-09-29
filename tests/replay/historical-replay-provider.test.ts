import { describe, expect, it } from "vitest";
import { HistoricalReplayProvider } from "@/replay/historical-replay-provider";
import type { ReplayDataset } from "@/replay/types";
import type { CanonicalCandle } from "@/types/market-data";

const M15 = 15 * 60_000;
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

function candle(timestamp: number, close: number): CanonicalCandle {
  return {
    symbol: "EURUSD",
    timeframe: "M15",
    timestamp,
    open: close - 0.0001,
    high: close + 0.0002,
    low: close - 0.0002,
    close,
    volume: 100,
    source: "history-test",
    closed: true,
  };
}

function dataset(): ReplayDataset {
  return {
    id: "provider-no-lookahead",
    symbols: {
      EURUSD: {
        metadata: {
          symbol: "EURUSD",
          baseCurrency: "EUR",
          quoteCurrency: "USD",
          pipSize: 0.0001,
          pricePrecision: 5,
          contractSize: 100_000,
          minLot: 0.01,
          maxLot: 100,
          lotStep: 0.01,
        },
        spreadPips: 0.8,
        candles: {
          M15: [
            candle(T0, 1.1),
            candle(T0 + M15, 1.101),
            candle(T0 + 2 * M15, 1.102),
          ],
        },
      },
    },
  };
}

describe("HistoricalReplayProvider", () => {
  it("never exposes a candle before that candle has closed", async () => {
    const provider = new HistoricalReplayProvider(dataset());

    const atSecondClose = await provider.getCandles({
      symbol: "EURUSD",
      timeframe: "M15",
      limit: 10,
      asOf: T0 + 2 * M15,
    });

    expect(atSecondClose.ok).toBe(true);
    if (!atSecondClose.ok) return;
    expect(atSecondClose.data.map((item) => item.timestamp)).toEqual([
      T0,
      T0 + M15,
    ]);
    expect(atSecondClose.data.some((item) => item.timestamp === T0 + 2 * M15)).toBe(false);
  });

  it("uses the latest CLOSED candle as the replay quote", async () => {
    const provider = new HistoricalReplayProvider(dataset());

    const quote = await provider.getLatestPrice("EURUSD", T0 + 2 * M15);

    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.data.price).toBe(1.101);
    expect(quote.data.timestamp).toBe(T0 + 2 * M15);
    expect(quote.data.spreadPips).toBe(0.8);
  });

  it("rejects non-chronological datasets instead of silently sorting them", () => {
    const broken = dataset();
    broken.symbols.EURUSD.candles.M15 = [
      candle(T0 + M15, 1.101),
      candle(T0, 1.1),
    ];

    expect(() => new HistoricalReplayProvider(broken)).toThrow(
      /strictly chronological/
    );
  });
});
