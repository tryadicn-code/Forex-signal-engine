import { candleCloseTime } from "@/market-data/timeframe";
import type {
  CandleRequest,
  MarketDataProvider,
} from "@/providers/market-data/provider";
import type { Timeframe } from "@/types/market";
import type {
  CanonicalCandle,
  ProviderError,
  ProviderResult,
  ProviderStatus,
  Quote,
  SymbolMetadata,
} from "@/types/market-data";
import type { ReplayDataset, ReplaySymbolData } from "@/replay/types";

const PRICE_TIMEFRAME_PREFERENCE: Timeframe[] = [
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D1",
  "W1",
  "MN",
];

/**
 * Deterministic historical market-data provider.
 *
 * Every request is bounded by `asOf`. Candles whose close time is after the
 * replay clock are invisible, which is the Phase 5 no-look-ahead boundary.
 */
export class HistoricalReplayProvider implements MarketDataProvider {
  readonly id: string;
  private readonly dataset: ReplayDataset;
  private status: ProviderStatus = {
    state: "CONNECTED",
    lastSuccessAt: null,
    lastFailureAt: null,
    errorCount: 0,
  };

  constructor(dataset: ReplayDataset) {
    validateDataset(dataset);
    this.dataset = freezeDataset(dataset);
    this.id = "replay:" + dataset.id;
  }

  async getCandles(
    request: CandleRequest
  ): Promise<ProviderResult<CanonicalCandle[]>> {
    const symbol = this.dataset.symbols[request.symbol];
    if (!symbol) {
      return this.fail(
        "SYMBOL_NOT_SUPPORTED",
        "Replay dataset has no symbol " + request.symbol + ".",
        request.asOf
      );
    }

    const candles = symbol.candles[request.timeframe];
    if (!candles) {
      return this.fail(
        "TIMEFRAME_NOT_SUPPORTED",
        "Replay dataset has no " + request.timeframe + " candles for " + request.symbol + ".",
        request.asOf
      );
    }

    const closed = candles.filter(
      (candle) =>
        candle.closed &&
        candleCloseTime(request.timeframe, candle.timestamp) <= request.asOf
    );
    const limited =
      request.limit > 0 ? closed.slice(Math.max(0, closed.length - request.limit)) : [];

    this.succeed(request.asOf);
    return { ok: true, data: limited.map((candle) => ({ ...candle })) };
  }

  async getLatestPrice(
    symbolCode: string,
    asOf: number = Number.POSITIVE_INFINITY
  ): Promise<ProviderResult<Quote>> {
    const symbol = this.dataset.symbols[symbolCode];
    if (!symbol) {
      return this.fail(
        "SYMBOL_NOT_SUPPORTED",
        "Replay dataset has no symbol " + symbolCode + ".",
        finiteAt(asOf)
      );
    }

    const latest = latestClosedCandle(symbol, asOf);
    if (!latest) {
      return this.fail(
        "EMPTY_RESPONSE",
        "No closed replay candle is available for " + symbolCode + " at this replay time.",
        finiteAt(asOf)
      );
    }

    const timestamp = candleCloseTime(latest.timeframe, latest.candle.timestamp);
    this.succeed(timestamp);
    return {
      ok: true,
      data: {
        symbol: symbolCode,
        price: latest.candle.close,
        spreadPips: symbol.spreadPips,
        timestamp,
      },
    };
  }

  async getSpread(
    symbolCode: string,
    asOf: number = Number.POSITIVE_INFINITY
  ): Promise<ProviderResult<number>> {
    const symbol = this.dataset.symbols[symbolCode];
    if (!symbol) {
      return this.fail(
        "SYMBOL_NOT_SUPPORTED",
        "Replay dataset has no symbol " + symbolCode + ".",
        finiteAt(asOf)
      );
    }
    this.succeed(finiteAt(asOf));
    return { ok: true, data: symbol.spreadPips };
  }

  async getSymbolMetadata(
    symbolCode: string
  ): Promise<ProviderResult<SymbolMetadata>> {
    const symbol = this.dataset.symbols[symbolCode];
    if (!symbol) {
      return this.fail(
        "SYMBOL_NOT_SUPPORTED",
        "Replay dataset has no symbol " + symbolCode + ".",
        0
      );
    }
    return { ok: true, data: { ...symbol.metadata } };
  }

  getProviderStatus(): ProviderStatus {
    return { ...this.status };
  }

  private succeed(at: number): void {
    this.status = {
      ...this.status,
      state: "CONNECTED",
      lastSuccessAt: finiteAt(at),
    };
  }

  private fail(
    code: ProviderError["code"],
    message: string,
    at: number
  ): ProviderResult<never> {
    const error: ProviderError = { code, message, at: finiteAt(at) };
    this.status = {
      ...this.status,
      state: "DEGRADED",
      lastFailureAt: error.at,
      errorCount: this.status.errorCount + 1,
    };
    return { ok: false, error };
  }
}

function latestClosedCandle(
  symbol: ReplaySymbolData,
  asOf: number
): { timeframe: Timeframe; candle: CanonicalCandle } | null {
  for (const timeframe of PRICE_TIMEFRAME_PREFERENCE) {
    const candles = symbol.candles[timeframe];
    if (!candles) continue;
    for (let index = candles.length - 1; index >= 0; index -= 1) {
      const candle = candles[index];
      if (
        candle.closed &&
        candleCloseTime(timeframe, candle.timestamp) <= asOf
      ) {
        return { timeframe, candle };
      }
    }
  }
  return null;
}

function validateDataset(dataset: ReplayDataset): void {
  if (!dataset.id.trim()) {
    throw new Error("Replay dataset id is required.");
  }

  const entries = Object.entries(dataset.symbols);
  if (entries.length === 0) {
    throw new Error("Replay dataset must contain at least one symbol.");
  }

  for (const [symbolCode, symbol] of entries) {
    if (symbol.metadata.symbol !== symbolCode) {
      throw new Error(
        "Replay metadata symbol mismatch: expected " +
          symbolCode +
          ", received " +
          symbol.metadata.symbol +
          "."
      );
    }
    if (!Number.isFinite(symbol.spreadPips) || symbol.spreadPips < 0) {
      throw new Error("Replay spread must be a finite non-negative value for " + symbolCode + ".");
    }

    for (const [timeframe, candles] of Object.entries(symbol.candles)) {
      if (!candles) continue;
      let previous = Number.NEGATIVE_INFINITY;
      for (const candle of candles) {
        if (candle.symbol !== symbolCode) {
          throw new Error("Replay candle symbol mismatch for " + symbolCode + ".");
        }
        if (candle.timeframe !== timeframe) {
          throw new Error(
            "Replay candle timeframe mismatch for " + symbolCode + " " + timeframe + "."
          );
        }
        if (!candle.closed) {
          throw new Error(
            "Replay datasets must contain closed candles only: " +
              symbolCode +
              " " +
              timeframe +
              "."
          );
        }
        if (candle.timestamp <= previous) {
          throw new Error(
            "Replay candles must be strictly chronological for " +
              symbolCode +
              " " +
              timeframe +
              "."
          );
        }
        previous = candle.timestamp;
      }
    }
  }
}

function freezeDataset(dataset: ReplayDataset): ReplayDataset {
  const symbols: ReplayDataset["symbols"] = {};
  for (const [symbolCode, symbol] of Object.entries(dataset.symbols)) {
    const candles: ReplaySymbolData["candles"] = {};
    for (const [timeframe, values] of Object.entries(symbol.candles)) {
      if (!values) continue;
      candles[timeframe as Timeframe] = values.map((candle) => ({ ...candle }));
    }
    symbols[symbolCode] = {
      metadata: { ...symbol.metadata },
      spreadPips: symbol.spreadPips,
      candles,
    };
  }
  return {
    ...dataset,
    symbols,
    conversionRates: dataset.conversionRates
      ? { ...dataset.conversionRates }
      : undefined,
  };
}

function finiteAt(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
