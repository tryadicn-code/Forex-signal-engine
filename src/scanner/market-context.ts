/**
 * Multi-timeframe market-context builder.
 *
 * Turns raw provider data into the canonical {@link MarketContext}: for each
 * timeframe, fetch -> normalize -> closed-candle filter -> freshness ->
 * validation, then resolve symbol metadata and the quote->account conversion.
 *
 * Timeframe isolation is enforced here: each timeframe gets its OWN candle
 * array, its OWN asOf and its OWN freshness. A consumer must never index another
 * timeframe's array; higher-timeframe confluence reaches the engines as
 * price/time/structured context only (the Phase 1 orchestrator already receives
 * it that way).
 *
 * REQUIRED CONTEXT: all four timeframes (D1, H4, H1, M15) must each return
 * enough VALID CLOSED candles, otherwise the context is not usable and this
 * returns a structured incomplete result instead of silently passing empty
 * arrays downstream. One symbol's failure never stops another symbol's scan.
 */

import type { Timeframe } from "@/types/market";
import type {
  Freshness,
  MarketContext,
  SymbolMetadata,
  TimeframeContext,
  ValidationResult,
} from "@/types/market-data";
import type { CandleRequest, MarketDataProvider } from "@/providers/market-data/provider";
import type {
  AccountConversionResolver,
  ConversionResult,
} from "@/market-data/account-conversion";
import { conversionResolved } from "@/market-data/account-conversion";
import type { TimeframeRoles } from "@/config/scanner";
import type { FreshnessThresholds } from "@/config/scanner";
import { filterClosedCandles } from "@/market-data/closed-candle";
import { validateCandles } from "@/market-data/validate";
import { UNUSABLE_CODES } from "@/market-data/validate";
import { timeframeFreshness, rollupFreshness } from "@/market-data/freshness";
import { intervalMs } from "@/market-data/timeframe";

/** Minimum usable closed candles a required timeframe must contribute. */
export const DEFAULT_MIN_BARS_PER_TIMEFRAME = 40;

/**
 * Validation issues that mean the candle itself was faulty (as opposed to a
 * series-level warning like a gap or staleness). Used to tell "the feed sent
 * broken bars" apart from "the feed sent too few good bars".
 */
const UNUSABLE_DATA_CODES: ReadonlySet<string> = new Set(UNUSABLE_CODES);

export interface TimeframeFetchOutcome {
  timeframe: Timeframe;
  /** Result of the fetch + validation pipeline; null when the provider failed. */
  validation: ValidationResult | null;
  /** Provider error, when the call itself failed. */
  providerError: string | null;
  freshness: Freshness;
}

/**
 * Why a market context could not be built for a symbol. Machine-readable so the
 * scanner result and the API can surface it without parsing free text.
 */
export type ContextRejectionReason =
  /** Every timeframe fetch failed at the provider boundary. */
  | "ALL_TIMEFRAMES_FAILED"
  /** One or more required timeframes failed at the provider boundary. */
  | "TIMEFRAME_PROVIDER_FAILURE"
  /** A required timeframe succeeded but had too few valid closed candles. */
  | "INSUFFICIENT_BARS"
  /** A required timeframe's data failed validation outright. */
  | "INVALID_TIMEFRAME_DATA"
  /** Instrument metadata could not be resolved for the symbol. */
  | "METADATA_UNAVAILABLE"
  /** The required timeframe roles are not the expected D1/H4/H1/M15 set. */
  | "MALFORMED_ROLES";

export interface BuildContextOutcome {
  /** The assembled context; null when any required check failed. */
  context: MarketContext | null;
  perTimeframe: TimeframeFetchOutcome[];
  conversion: ConversionResult | null;
  /**
   * Machine-readable rejection reason when the context is null, plus the
   * timeframes responsible so the failure is attributable, not anonymous.
   */
  rejection: { reason: ContextRejectionReason; timeframes: Timeframe[] } | null;
  /** Provider failure that prevented data for this symbol. */
  providerError: string | null;
}

export interface BuildMarketContextInput {
  symbol: string;
  provider: MarketDataProvider;
  roles: TimeframeRoles;
  thresholds: FreshnessThresholds;
  candleLookback: number;
  accountCurrency: string;
  conversionResolver: AccountConversionResolver;
  /** Analysis time T; only candles closed at or before T are used. */
  asOf: number;
  /** Minimum valid closed candles each required timeframe must contribute. */
  minBarsPerTimeframe?: number;
}

/** The four timeframes Phase 2 requires before the Phase 1 orchestrator runs. */
const REQUIRED_ROLE_KEYS = ["macro", "bias", "setup", "trigger"] as const;

/**
 * Fetch and prepare ONE timeframe.
 *
 * Order matters: fetch -> normalize (inside the provider) -> closed-candle
 * filter -> validate. The closed-candle filter runs first so an unfinished bar
 * is dropped before validation, never reported as a data error.
 */
export async function fetchTimeframe(
  symbol: string,
  timeframe: Timeframe,
  input: BuildMarketContextInput
): Promise<TimeframeFetchOutcome> {
  const request: CandleRequest = {
    symbol,
    timeframe,
    limit: input.candleLookback,
    asOf: input.asOf,
  };
  const result = await input.provider.getCandles(request);

  if (!result.ok) {
    return {
      timeframe,
      validation: null,
      providerError: `${result.error.code}: ${result.error.message}`,
      freshness: timeframeFreshness({
        source: input.provider.id,
        timeframe,
        newestCandleTimestamp: undefined,
        receivedAt: input.asOf,
        thresholds: input.thresholds,
      }),
    };
  }

  const closed = filterClosedCandles(result.data, timeframe, input.asOf);
  const validation = validateCandles(closed.candles, {
    symbol,
    timeframe,
    asOf: input.asOf,
    staleAfterMs: input.thresholds.delayedBars * intervalMs(timeframe),
    minBars: input.minBarsPerTimeframe ?? DEFAULT_MIN_BARS_PER_TIMEFRAME,
  });

  const newest = validation.candles[validation.candles.length - 1];
  const freshness = timeframeFreshness({
    source: input.provider.id,
    timeframe,
    newestCandleTimestamp: newest?.timestamp,
    receivedAt: input.asOf,
    thresholds: input.thresholds,
  });

  return {
    timeframe,
    validation,
    providerError: null,
    freshness,
  };
}

/**
 * Classify one timeframe's outcome against the required-context rules.
 * Returns null when the timeframe is usable, or the reason it is not.
 *
 * Two distinct failures must not be conflated:
 *  - INSUFFICIENT_BARS: the data was clean but too few candles survived to
 *    analyse (a thin or short history).
 *  - INVALID_TIMEFRAME_DATA: the data was present but broken (malformed OHLC,
 *    non-finite prices, out-of-order timestamps), so validation had to drop it.
 * Both end with too few usable candles, but the cause is actionable: one asks
 * for more history, the other asks for a healthier feed.
 */
function classifyOutcome(
  outcome: TimeframeFetchOutcome,
  minBars: number
): ContextRejectionReason | null {
  if (outcome.validation === null) {
    return outcome.providerError === null ? "INVALID_TIMEFRAME_DATA" : "TIMEFRAME_PROVIDER_FAILURE";
  }
  if (outcome.validation.valid) {
    return null;
  }
  const usable = outcome.validation.candles.length;
  const droppedForFault = outcome.validation.issues.some((issue) =>
    UNUSABLE_DATA_CODES.has(issue.code)
  );
  if (usable === 0 && droppedForFault) {
    return "INVALID_TIMEFRAME_DATA";
  }
  return usable < minBars ? "INSUFFICIENT_BARS" : "INVALID_TIMEFRAME_DATA";
}

export async function buildMarketContext(
  input: BuildMarketContextInput
): Promise<BuildContextOutcome> {
  const minBars = input.minBarsPerTimeframe ?? DEFAULT_MIN_BARS_PER_TIMEFRAME;

  // Guard the required-timeframe contract itself: a misconfigured role set must
  // fail loudly here rather than silently analyse the wrong timeframes.
  const configured = new Set<Timeframe>(REQUIRED_ROLE_KEYS.map((r) => input.roles[r]));
  if (configured.size !== REQUIRED_ROLE_KEYS.length) {
    return {
      context: null,
      perTimeframe: [],
      conversion: null,
      rejection: { reason: "MALFORMED_ROLES", timeframes: [] },
      providerError: "Timeframe roles must be four distinct timeframes (D1/H4/H1/M15).",
    };
  }

  const perTimeframe: TimeframeFetchOutcome[] = [];
  for (const role of REQUIRED_ROLE_KEYS) {
    perTimeframe.push(
      await fetchTimeframe(input.symbol, input.roles[role], input)
    );
  }

  const byTimeframe = new Map(perTimeframe.map((o) => [o.timeframe, o]));
  const byRole: Record<keyof TimeframeRoles, TimeframeFetchOutcome | undefined> = {
    macro: byTimeframe.get(input.roles.macro),
    bias: byTimeframe.get(input.roles.bias),
    setup: byTimeframe.get(input.roles.setup),
    trigger: byTimeframe.get(input.roles.trigger),
  };

  // --- Required-context gate -------------------------------------------------
  // Every required timeframe must be usable. Partial context is NOT passed on:
  // an H4-only context would let the Phase 1 engines analyse bias without the
  // setup and trigger timeframes they are asked to read.
  const failures = new Map<ContextRejectionReason, Timeframe[]>();
  for (const outcome of perTimeframe) {
    const why = classifyOutcome(outcome, minBars);
    if (why !== null) {
      if (!failures.has(why)) failures.set(why, []);
      failures.get(why)!.push(outcome.timeframe);
    }
  }

  if (failures.size > 0) {
    // Provider-level failures dominate: if every timeframe failed at the
    // boundary that is the clearest signal for health tracking.
    const reason: ContextRejectionReason = failures.has("ALL_TIMEFRAMES_FAILED")
      ? "ALL_TIMEFRAMES_FAILED"
      : (failures.has("TIMEFRAME_PROVIDER_FAILURE")
          ? "TIMEFRAME_PROVIDER_FAILURE"
          : (failures.has("INSUFFICIENT_BARS") ? "INSUFFICIENT_BARS" : "INVALID_TIMEFRAME_DATA"));
    const timeframes = [...failures.values()].flat();
    const firstError = perTimeframe.find((o) => o.providerError);
    return {
      context: null,
      perTimeframe,
      conversion: null,
      rejection: { reason, timeframes },
      providerError: firstError?.providerError ?? null,
    };
  }

  // All provider calls succeeded from here on; metadata is still required.
  const metaResult = await input.provider.getSymbolMetadata(input.symbol);
  let metadata: SymbolMetadata;
  if (metaResult.ok) {
    metadata = metaResult.data;
  } else {
    return {
      context: null,
      perTimeframe,
      conversion: null,
      rejection: { reason: "METADATA_UNAVAILABLE", timeframes: [] },
      providerError: `${metaResult.error.code}: ${metaResult.error.message}`,
    };
  }

  const conversion = input.conversionResolver.resolve(metadata, input.accountCurrency);

  const makeTf = (outcome: TimeframeFetchOutcome): TimeframeContext => {
    const candles = outcome.validation!.candles;
    return {
      timeframe: outcome.timeframe,
      candles,
      asOf: candles.length ? candles[candles.length - 1].timestamp : input.asOf,
      freshness: outcome.freshness,
    };
  };

  const latestPriceResult = await input.provider.getLatestPrice(input.symbol, input.asOf);
  const triggerTf = makeTf(byRole.trigger!);

  const context: MarketContext = {
    symbol: input.symbol,
    metadata,
    d1: makeTf(byRole.macro!),
    h4: makeTf(byRole.bias!),
    h1: makeTf(byRole.setup!),
    m15: triggerTf,
    latestPrice: latestPriceResult.ok ? latestPriceResult.data.price : triggerTf.candles[triggerTf.candles.length - 1]?.close ?? 0,
    spreadPips: latestPriceResult.ok ? latestPriceResult.data.spreadPips : undefined,
    accountCurrency: input.accountCurrency,
    // Present only when a conversion was actually needed AND resolved. When
    // the quote currency already matches the account there is no conversion to
    // express, so the field stays absent rather than reporting a spurious 1.
    quoteToAccountConversionRate:
      conversion.notRequired || !conversionResolved(conversion)
        ? undefined
        : conversion.rate,
    source: input.provider.id,
    receivedAt: input.asOf,
    marketTimestamp:
      triggerTf.freshness.marketTimestamp ?? triggerTf.asOf,
    freshness: {
      source: input.provider.id,
      marketTimestamp:
        triggerTf.freshness.marketTimestamp ?? triggerTf.asOf,
      receivedAt: input.asOf,
      ageMs: triggerTf.freshness.ageMs,
      missing: triggerTf.freshness.missing,
      status: rollupFreshness(perTimeframe.map((o) => o.freshness.status)),
    },
  };

  return { context, perTimeframe, conversion, rejection: null, providerError: null };
}
// ---------------------------------------------------------------------------
// Partial market context (TRD-004 B1)
// ---------------------------------------------------------------------------

/**
 * Partial market context: D1 + H4 + H1 usable, M15 missing.
 *
 * Deliberately a separate type from {@link MarketContext}: the full contract
 * requires every timeframe, so nothing downstream can accidentally consume a
 * partial as if it were complete. Only the scanner's partial pipeline path
 * accepts this type; trigger, risk, and execution are never evaluated from it.
 */
export interface PartialMarketContext {
  symbol: string;
  metadata: SymbolMetadata;
  d1: TimeframeContext;
  h4: TimeframeContext;
  h1: TimeframeContext;
  /** Null when the trigger timeframe could not be built. */
  m15: TimeframeContext | null;
  latestPrice: number;
  spreadPips?: number;
  accountCurrency: string;
  quoteToAccountConversionRate?: number;
  source: string;
  receivedAt: number;
  marketTimestamp: number;
  freshness: Freshness;
  /** Timeframes that could not be built. Non-empty when this is a partial. */
  missingTimeframes: Timeframe[];
}

export interface BuildPartialContextOutcome {
  context: PartialMarketContext | null;
  perTimeframe: TimeframeFetchOutcome[];
  conversion: ConversionResult | null;
  rejection: { reason: ContextRejectionReason; timeframes: Timeframe[] } | null;
  providerError: string | null;
}

/**
 * TRD-004 B1: build a partial context when the trigger timeframe (M15) is
 * missing but D1, H4, and H1 are healthy.
 *
 * The full builder stays all-or-nothing; this function is additive and does
 * not replace it. Callers must treat the result as analytical-only: the
 * trigger, risk, and execution stages are never evaluated from a partial
 * context, because that would compromise fail-closed safety.
 */
export async function buildPartialMarketContext(
  input: BuildMarketContextInput
): Promise<BuildPartialContextOutcome> {
  const minBars = input.minBarsPerTimeframe ?? DEFAULT_MIN_BARS_PER_TIMEFRAME;

  const configured = new Set<Timeframe>(
    REQUIRED_ROLE_KEYS.map((r) => input.roles[r])
  );
  if (configured.size !== REQUIRED_ROLE_KEYS.length) {
    return {
      context: null,
      perTimeframe: [],
      conversion: null,
      rejection: { reason: "MALFORMED_ROLES", timeframes: [] },
      providerError:
        "Timeframe roles must be four distinct timeframes (D1/H4/H1/M15).",
    };
  }

  const perTimeframe: TimeframeFetchOutcome[] = [];
  for (const role of REQUIRED_ROLE_KEYS) {
    perTimeframe.push(
      await fetchTimeframe(input.symbol, input.roles[role], input)
    );
  }

  const byRole: Record<keyof TimeframeRoles, TimeframeFetchOutcome | undefined> = {
    macro: perTimeframe.find((o) => o.timeframe === input.roles.macro),
    bias: perTimeframe.find((o) => o.timeframe === input.roles.bias),
    setup: perTimeframe.find((o) => o.timeframe === input.roles.setup),
    trigger: perTimeframe.find((o) => o.timeframe === input.roles.trigger),
  };

  // Partial mode requires D1, H4, H1. The trigger timeframe is allowed to
  // fail; that is the entire premise of partial mode.
  const required = [byRole.macro!, byRole.bias!, byRole.setup!];
  const requiredFailures = new Map<ContextRejectionReason, Timeframe[]>();
  for (const outcome of required) {
    const why = classifyOutcome(outcome, minBars);
    if (why !== null) {
      if (!requiredFailures.has(why)) requiredFailures.set(why, []);
      requiredFailures.get(why)!.push(outcome.timeframe);
    }
  }

  if (requiredFailures.size > 0) {
    const reason: ContextRejectionReason = requiredFailures.has(
      "TIMEFRAME_PROVIDER_FAILURE"
    )
      ? "TIMEFRAME_PROVIDER_FAILURE"
      : requiredFailures.has("INSUFFICIENT_BARS")
        ? "INSUFFICIENT_BARS"
        : "INVALID_TIMEFRAME_DATA";
    const timeframes = [...requiredFailures.values()].flat();
    const firstError = required.find((o) => o.providerError);
    return {
      context: null,
      perTimeframe,
      conversion: null,
      rejection: { reason, timeframes },
      providerError: firstError?.providerError ?? null,
    };
  }

  const metaResult = await input.provider.getSymbolMetadata(input.symbol);
  if (!metaResult.ok) {
    return {
      context: null,
      perTimeframe,
      conversion: null,
      rejection: { reason: "METADATA_UNAVAILABLE", timeframes: [] },
      providerError: `${metaResult.error.code}: ${metaResult.error.message}`,
    };
  }
  const metadata = metaResult.data;
  const conversion = input.conversionResolver.resolve(
    metadata,
    input.accountCurrency
  );

  const makeTf = (outcome: TimeframeFetchOutcome): TimeframeContext => {
    const candles = outcome.validation!.candles;
    return {
      timeframe: outcome.timeframe,
      candles,
      asOf: candles.length
        ? candles[candles.length - 1].timestamp
        : input.asOf,
      freshness: outcome.freshness,
    };
  };

  const d1 = makeTf(byRole.macro!);
  const h4 = makeTf(byRole.bias!);
  const h1 = makeTf(byRole.setup!);

  const triggerWhy = classifyOutcome(byRole.trigger!, minBars);
  const m15 = triggerWhy === null ? makeTf(byRole.trigger!) : null;
  const missingTimeframes: Timeframe[] =
    triggerWhy === null ? [] : [input.roles.trigger];

  const latestPriceResult = await input.provider.getLatestPrice(
    input.symbol,
    input.asOf
  );
  const priceSource = m15 ?? h1;
  const latestPrice = latestPriceResult.ok
    ? latestPriceResult.data.price
    : priceSource.candles[priceSource.candles.length - 1]?.close ?? 0;
  const spreadPips = latestPriceResult.ok
    ? latestPriceResult.data.spreadPips
    : undefined;

  return {
    context: {
      symbol: input.symbol,
      metadata,
      d1,
      h4,
      h1,
      m15,
      latestPrice,
      spreadPips,
      accountCurrency: input.accountCurrency,
      quoteToAccountConversionRate:
        conversion.notRequired || !conversionResolved(conversion)
          ? undefined
          : conversion.rate,
      source: input.provider.id,
      receivedAt: input.asOf,
      marketTimestamp:
        priceSource.freshness.marketTimestamp ?? priceSource.asOf,
      freshness: {
        source: input.provider.id,
        marketTimestamp:
          priceSource.freshness.marketTimestamp ?? priceSource.asOf,
        receivedAt: input.asOf,
        ageMs: priceSource.freshness.ageMs,
        missing: priceSource.freshness.missing,
        status: rollupFreshness(perTimeframe.map((o) => o.freshness.status)),
      },
      missingTimeframes,
    },
    perTimeframe,
    conversion,
    rejection: null,
    providerError: null,
  };
}
