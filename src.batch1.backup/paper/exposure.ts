export type ForexDirection = "LONG" | "SHORT";

export interface CurrencyExposureLeg {
  currency: string;
  direction: ForexDirection;
}

export interface PositionExposureLike {
  symbol: string;
  side: ForexDirection;
}

export interface CurrencyExposureBlock {
  currency: string;
  direction: ForexDirection;
  existingCount: number;
  limit: number;
}

/**
 * Convert a 6-character FX symbol + trade side into its two directional
 * currency legs.
 *
 * EURJPY SHORT => EUR SHORT + JPY LONG.
 */
export function currencyExposureLegs(
  symbol: string,
  side: ForexDirection
): CurrencyExposureLeg[] {
  const normalized = symbol.toUpperCase();
  if (!/^[A-Z]{6}$/.test(normalized)) return [];

  const base = normalized.slice(0, 3);
  const quote = normalized.slice(3, 6);

  return side === "LONG"
    ? [
        { currency: base, direction: "LONG" },
        { currency: quote, direction: "SHORT" },
      ]
    : [
        { currency: base, direction: "SHORT" },
        { currency: quote, direction: "LONG" },
      ];
}

/**
 * Return the first directional currency leg that would exceed the configured
 * portfolio exposure limit when the candidate is added.
 */
export function findDirectionalCurrencyExposureBlock(
  openPositions: PositionExposureLike[],
  candidateSymbol: string,
  candidateSide: ForexDirection,
  maxPerCurrencyDirection: number
): CurrencyExposureBlock | null {
  if (
    !Number.isInteger(maxPerCurrencyDirection) ||
    maxPerCurrencyDirection <= 0
  ) {
    return null;
  }

  const candidateLegs = currencyExposureLegs(candidateSymbol, candidateSide);
  for (const leg of candidateLegs) {
    const existingCount = openPositions.reduce((count, position) => {
      const matches = currencyExposureLegs(position.symbol, position.side).some(
        (existing) =>
          existing.currency === leg.currency &&
          existing.direction === leg.direction
      );
      return count + (matches ? 1 : 0);
    }, 0);

    if (existingCount >= maxPerCurrencyDirection) {
      return {
        currency: leg.currency,
        direction: leg.direction,
        existingCount,
        limit: maxPerCurrencyDirection,
      };
    }
  }

  return null;
}
