/**
 * MockMarketDataProvider.
 *
 * A deterministic, offline market-data provider. It needs no network and no
 * paid API, yet produces every scenario the scanner and its tests require:
 * uptrend, downtrend, range, valid bullish/bearish setups, waiting and
 * confirmed triggers, stale data, malformed data and outright provider failure.
 *
 * Determinism: every series is a pure function of (symbol, timeframe, asOf,
 * scenario). The same arguments always yield the same candles, so a test that
 * passes today passes forever - and a replay at an earlier `asOf` yields
 * strictly the past, which is what makes no-look-ahead testing possible.
 *
 * The generator deliberately reuses the Phase 1 fixture philosophy (a seeded
 * `mulberry32` RNG and a sinusoidal trend that prints real swings) rather than
 * an incompatible fixture ecosystem.
 */

import type { Timeframe } from "@/types/market";
import type {
  CanonicalCandle,
  ProviderError,
  ProviderResult,
  Quote,
  SymbolMetadata,
} from "@/types/market-data";
import type { CandleRequest, MarketDataProvider } from "./provider";
import { SYMBOL_METADATA } from "@/config/scanner";
import type { RateTable } from "@/market-data/account-conversion";
import { normalizeCandles } from "@/market-data/normalize";
import type { RawCandle } from "@/market-data/normalize";
import { intervalMs, alignToClosedCandle } from "@/market-data/timeframe";
import { mulberry32 } from "@/core/indicators";

export type MockDirection = "UP" | "DOWN" | "RANGE";

export interface MockSymbolScenario {
  direction: MockDirection;
  /** Add a pullback that sinks price into a setup zone (H1 and finer). */
  pullback?: boolean;
  /** Add the strong resumption that breaks structure and confirms a trigger. */
  resumption?: boolean;
  /** Simulate a total provider failure for this symbol. */
  fail?: boolean;
  /** End the series far enough in the past to classify as STALE. */
  stale?: boolean;
  /** Inject one malformed candle (high below low). */
  malformed?: boolean;
  /** Starting price; defaults to a realistic level for the pair. */
  startPrice?: number;
  /** Candles per timeframe. */
  bars?: number;
  /** Spread in pips. */
  spreadPips?: number;
}

/** Per-symbol scenario overrides; symbols without an entry use the default. */
export interface MockProviderConfig {
  scenarios?: Record<string, MockSymbolScenario>;
  /** Rates used to resolve quote->account conversion, keyed BASEQUOTE. */
  rates?: RateTable;
  /** Bars generated per timeframe when the scenario does not say. */
  defaultBars?: number;
}

/** Default rates for a USD account, expressed as one unit of BASE in QUOTE. */
export const DEFAULT_MOCK_RATES: RateTable = {
  USDJPY: 149.5,
  JPYUSD: 1 / 149.5,
  GBPUSD: 1.265,
  EURUSD: 1.085,
  AUDUSD: 0.655,
  USDCHF: 0.895,
  CHFUSD: 1 / 0.895,
  USDCAD: 1.365,
  CADUSD: 1 / 1.365,
  EURJPY: 162.2,
  GBPJPY: 189.1,
  EURGBP: 0.855,
  AUDJPY: 97.9,
  EURAUD: 1.656,
  GBPAUD: 1.93,
};

/** Realistic starting levels so generated candles look like real FX prices. */
const START_PRICES: Record<string, number> = {
  EURUSD: 1.085, GBPUSD: 1.265, USDJPY: 149.5, USDCHF: 0.895,
  AUDUSD: 0.655, NZDUSD: 0.605, USDCAD: 1.365, EURJPY: 162.2,
  GBPJPY: 189.1, EURGBP: 0.855, AUDJPY: 97.9, EURAUD: 1.656,
  GBPAUD: 1.93,
};

const HOUR = 60 * 60 * 1000;
const ANALYSIS_ANCHOR = Date.UTC(2024, 5, 3, 12, 0, 0);

export class MockMarketDataProvider implements MarketDataProvider {
  readonly id = "mock";
  private readonly scenarios: Record<string, MockSymbolScenario>;
  private readonly rates: RateTable;
  private readonly defaultBars: number;

  private lastSuccessAt: number | null = null;
  private lastFailureAt: number | null = null;
  private errorCount = 0;

  constructor(config: MockProviderConfig = {}) {
    this.scenarios = config.scenarios ?? {};
    this.rates = config.rates ?? DEFAULT_MOCK_RATES;
    this.defaultBars = config.defaultBars ?? 220;
  }

  /** Rates are market data too; the conversion resolver reads them from here. */
  getRates(): RateTable {
    return { ...this.rates };
  }

  getScenario(symbol: string): MockSymbolScenario {
    return this.scenarios[symbol] ?? { direction: "UP" };
  }

  async getCandles(request: CandleRequest): Promise<ProviderResult<CanonicalCandle[]>> {
    const scenario = this.getScenario(request.symbol);
    if (scenario.fail) {
      this.recordFailure();
      return this.fail("PROVIDER_UNAVAILABLE", `Mock provider configured to fail for ${request.symbol}.`);
    }
    const meta = SYMBOL_METADATA[request.symbol];
    if (!meta) {
      this.recordFailure();
      return this.fail("SYMBOL_NOT_SUPPORTED", `No metadata for ${request.symbol}.`);
    }
    const raw = this.generate(request.symbol, request.timeframe, scenario, request.asOf);
    const normalized = normalizeCandles(raw, {
      symbol: request.symbol,
      timeframe: request.timeframe,
      source: this.id,
      asOf: request.asOf,
      defaultVolume: 1000,
    });
    const limited = normalized.slice(Math.max(0, normalized.length - request.limit));
    this.recordSuccess();
    return { ok: true, data: limited };
  }

  async getLatestPrice(symbol: string, asOf: number = this.now()): Promise<ProviderResult<Quote>> {
    const scenario = this.getScenario(symbol);
    if (scenario.fail) {
      this.recordFailure();
      return this.fail("PROVIDER_UNAVAILABLE", `Mock provider configured to fail for ${symbol}.`);
    }
    const raw = this.generate(symbol, "M15", scenario, asOf);
    const last = raw[raw.length - 1];
    this.recordSuccess();
    return {
      ok: true,
      data: { symbol, price: last.close, spreadPips: scenario.spreadPips ?? 0.6, timestamp: last.timestamp },
    };
  }

  async getSpread(symbol: string): Promise<ProviderResult<number>> {
    const scenario = this.getScenario(symbol);
    this.recordSuccess();
    return { ok: true, data: scenario.spreadPips ?? 0.6 };
  }

  async getSymbolMetadata(symbol: string): Promise<ProviderResult<SymbolMetadata>> {
    const meta = SYMBOL_METADATA[symbol];
    if (!meta) {
      this.recordFailure();
      return this.fail("SYMBOL_NOT_SUPPORTED", `No metadata for ${symbol}.`);
    }
    this.recordSuccess();
    return { ok: true, data: meta };
  }

  getProviderStatus() {
    return {
      state: this.errorCount > 0 ? "DEGRADED" : "CONNECTED",
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      errorCount: this.errorCount,
    } as const;
  }

  // ------------------------------------------------------------------
  // Series generation
  // ------------------------------------------------------------------

  private generate(
    symbol: string,
    timeframe: Timeframe,
    scenario: MockSymbolScenario,
    asOf: number
  ): RawCandle[] {
    const interval = intervalMs(timeframe);
    const bars = scenario.bars ?? this.defaultBars;
    let lastOpen = alignToClosedCandle(timeframe, asOf);
    if (scenario.stale) {
      // Push the whole series back so the newest candle is overdue for this tf.
      lastOpen -= 8 * interval;
    }
    const startPrice = scenario.startPrice ?? START_PRICES[symbol] ?? 1.1;
    const dir = scenario.direction === "UP" ? 1 : scenario.direction === "DOWN" ? -1 : 0;
    const amp = startPrice * 0.004;
    const period = 18;
    const drift = startPrice * 0.0008;
    const rand = mulberry32(42);

    // The pullback/resumption tail only belongs on the setup + trigger
    // timeframes; the bias and macro timeframes stay clean trends.
    const fine = interval <= HOUR;
    const pullback = fine && Boolean(scenario.pullback || scenario.resumption);
    const resume = fine && Boolean(scenario.resumption);
    const pullbackStart = bars - 16;
    const resumeStart = bars - 7;

    const out: RawCandle[] = [];
    for (let i = 0; i < bars; i++) {
      const timestamp = lastOpen - (bars - 1 - i) * interval;
      let close: number;
      if (dir === 0) {
        close = startPrice + amp * Math.sin((i * 2 * Math.PI) / 10) + (rand() - 0.5) * amp * 0.2;
      } else {
        close = startPrice + dir * drift * i + amp * Math.sin((i * 2 * Math.PI) / period);
      }
      if (pullback && i >= pullbackStart && i < resumeStart) {
        const depth = (i - pullbackStart) / Math.max(1, resumeStart - pullbackStart);
        close -= dir * startPrice * 0.012 * depth;
      }
      if (resume && i >= resumeStart) {
        const strength = (i - resumeStart) / Math.max(1, bars - 1 - resumeStart);
        close += dir * startPrice * 0.02 * (0.4 + 0.6 * strength);
      }
      const openGap = dir !== 0 ? dir * amp * 0.25 : -amp * 0.05;
      const open = close - openGap;
      const high = Math.max(open, close) + amp * 0.18;
      const low = Math.min(open, close) - amp * 0.18;
      out.push({ timestamp, open, high, low, close, volume: 1000 });
    }

    if (scenario.malformed && out.length > 6) {
      const idx = out.length - 5;
      out[idx] = { ...out[idx], high: out[idx].low - 1 };
    }
    return out;
  }

  private now(): number {
    return ANALYSIS_ANCHOR;
  }

  private recordSuccess(): void {
    this.lastSuccessAt = Date.now();
  }

  private recordFailure(): void {
    this.lastFailureAt = Date.now();
    this.errorCount += 1;
  }

  private fail(code: ProviderError["code"], message: string): ProviderResult<never> {
    return { ok: false, error: { code, message, at: Date.now() } };
  }
}