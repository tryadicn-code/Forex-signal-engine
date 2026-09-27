/**
 * Account-currency conversion resolution.
 *
 * The Phase 1 Risk Engine measures risk in ACCOUNT currency, so a pair whose
 * quote currency differs from the account currency needs a quote->account rate
 * (JPY legs especially: without it a ~6.67 USD/pip move would be priced as 1000
 * and mis-sized by ~150x).
 *
 * The Risk Engine deliberately never fetches a rate and never fakes one. This
 * module is the Phase 2 side of that contract: it RESOLVES the rate from market
 * data and hands it to the engine, and when it cannot, it says so explicitly so
 * the Risk Engine can reject.
 */

import type { SymbolMetadata } from "@/types/market-data";

export interface ConversionRateSource {
  /** Base currency of the rate pair. */
  base: string;
  /** Quote currency of the rate pair. */
  quote: string;
  /** Resolved rate, or undefined when unavailable. */
  rate: number | undefined;
  /** Human-readable provenance for auditability. */
  source: string;
}

export interface ConversionResult {
  /** True when no conversion is needed (quote currency === account currency). */
  notRequired: boolean;
  /** The effective rate to hand the Risk Engine. */
  rate: number;
  /** Provenance description, for evidence/audit. */
  source: string;
}

/**
 * Rates keyed as "BASEQUOTE" (ISO-style, as the market quotes them), mapping to
 * the value of one unit of BASE in QUOTE. The mock provider supplies these.
 */
export type RateTable = Record<string, number>;

/** Quote currency -> account currency resolution. */
export interface AccountConversionResolver {
  resolve(symbol: SymbolMetadata, accountCurrency: string): ConversionResult;
}

/**
 * Resolve the quote->account conversion for a symbol on an account.
 *
 * Same currency: the effective rate is 1 by definition and no rate is looked
 * up. This mirrors the Risk Engine's own same-currency lock so both layers
 * agree exactly.
 *
 * Cross currency: the direct quote is used when the market quotes it
 * (e.g. JPYUSD for a USD account trading USDJPY). When the market only quotes
 * the inverse (USDJPY), the rate is derived as 1 / USDJPY - that is still a real
 * market rate, not an invented one. When neither is available the resolution
 * fails and the caller must let the Risk Engine reject.
 */
export function resolveConversion(
  symbol: SymbolMetadata,
  accountCurrency: string,
  rates: RateTable
): ConversionResult {
  if (symbol.quoteCurrency === accountCurrency) {
    return {
      notRequired: true,
      rate: 1,
      source: `${symbol.quoteCurrency} matches account currency ${accountCurrency}; conversion is 1 by definition.`,
    };
  }

  const direct = rates[`${symbol.quoteCurrency}${accountCurrency}`];
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
    return {
      notRequired: false,
      rate: direct,
      source: `Direct market rate ${symbol.quoteCurrency}${accountCurrency} = ${direct}.`,
    };
  }

  const inverseKey = `${accountCurrency}${symbol.quoteCurrency}`;
  const inverse = rates[inverseKey];
  if (typeof inverse === "number" && Number.isFinite(inverse) && inverse > 0) {
    const rate = 1 / inverse;
    return {
      notRequired: false,
      rate,
      source: `Inverted market rate 1/${inverseKey} = ${rate.toFixed(8)}.`,
    };
  }

  return {
    notRequired: false,
    rate: 0,
    source: `No ${symbol.quoteCurrency}${accountCurrency} (or inverse ${inverseKey}) rate available.`,
  };
}

/** True when a cross-currency resolution actually produced a usable rate. */
export function conversionResolved(result: ConversionResult): boolean {
  return result.notRequired || (Number.isFinite(result.rate) && result.rate > 0);
}

/** In-memory resolver backed by a rate table, for the mock provider/tests. */
export class TableAccountConversionResolver
  implements AccountConversionResolver
{
  constructor(private rates: RateTable = {}) {}

  resolve(symbol: SymbolMetadata, accountCurrency: string): ConversionResult {
    return resolveConversion(symbol, accountCurrency, this.rates);
  }

  setRates(rates: RateTable): void {
    this.rates = { ...rates };
  }
}