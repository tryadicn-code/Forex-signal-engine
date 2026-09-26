import { describe, expect, it } from "vitest";
import type { CurrencyPair } from "@/types/market";
import { evaluateRisk } from "@/core/risk";

function pair(overrides: Partial<CurrencyPair>): CurrencyPair {
  return {
    code: "X",
    base: "A",
    quote: "B",
    pipSize: 0.0001,
    contractSize: 100_000,
    lotStep: 0.01,
    ...overrides,
  };
}

const EURUSD_USD = pair({ code: "EURUSD", quote: "USD", pipSize: 0.0001 });
const USDJPY_USD = pair({ code: "USDJPY", quote: "JPY", pipSize: 0.01 });
const EURGBP_USD = pair({ code: "EURGBP", quote: "GBP", pipSize: 0.0001 });
const GBPJPY_USD = pair({ code: "GBPJPY", quote: "JPY", pipSize: 0.01 });

const ACCOUNT_USD = "USD";

/** Account-currency risk actually consumed by the sized position. */
function actualRisk(
  positionSize: number,
  stopDistancePips: number,
  instrument: CurrencyPair,
  conversionRate: number
): number {
  const pipValue = instrument.contractSize * instrument.pipSize * conversionRate;
  return positionSize * stopDistancePips * pipValue;
}

describe("evaluateRisk - account-currency position sizing", () => {
  it("sizes EURUSD on a USD account with a 1:1 quote-to-account rate", () => {
    const result = evaluateRisk({
      entry: 1.1,
      stop: 1.095,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: EURUSD_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
      quoteToAccountConversionRate: 1,
    });
    expect(result.data.approved).toBe(true);
    expect(result.data.positionSize).toBeCloseTo(0.09, 6);
    expect(result.data.rr).toBeCloseTo(2.0, 6);
  });

  it("sizes USDJPY on a USD account using the JPY->USD conversion", () => {
    const result = evaluateRisk({
      entry: 150.0,
      stop: 149.5,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: USDJPY_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
      quoteToAccountConversionRate: 1 / 150,
    });
    expect(result.data.approved).toBe(true);
    expect(result.data.positionSize).toBeCloseTo(0.15, 6);
  });

  it("sizes EURGBP on a USD account using the GBP->USD conversion", () => {
    const result = evaluateRisk({
      entry: 0.85,
      stop: 0.845,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: EURGBP_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
      quoteToAccountConversionRate: 1.27,
    });
    expect(result.data.approved).toBe(true);
    expect(result.data.positionSize).toBeCloseTo(0.07, 6);
  });

  it("sizes GBPJPY on a USD account using the JPY->USD conversion", () => {
    const result = evaluateRisk({
      entry: 190.0,
      stop: 189.0,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: GBPJPY_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
      quoteToAccountConversionRate: 1 / 190,
    });
    expect(result.data.approved).toBe(true);
    expect(result.data.positionSize).toBeCloseTo(0.09, 6);
  });
});

describe("evaluateRisk - account-currency conversion safety lock", () => {
  it("EURUSD on a USD account needs no external conversion rate", () => {
    // Quote currency USD matches the account currency USD, so conversion is 1
    // by definition: the caller supplies no rate and the trade still sizes.
    const result = evaluateRisk({
      entry: 1.1,
      stop: 1.095,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: EURUSD_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
    });
    expect(result.data.approved).toBe(true);
    expect(result.data.rejectionReason).toBeNull();
    expect(result.data.positionSize).toBeCloseTo(0.09, 6);
  });

  it("USDJPY on a USD account is rejected when the conversion rate is missing", () => {
    // JPY does not match the USD account. Defaulting the rate to 1 would value
    // a pip at 1000 instead of ~6.67 and misprice the trade ~150x, so the
    // engine rejects instead of guessing.
    const result = evaluateRisk({
      entry: 150.0,
      stop: 149.5,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: USDJPY_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
    });
    expect(result.data.approved).toBe(false);
    expect(result.status).toBe("RISK_REJECTED");
    expect(result.data.positionSize).toBe(0);
    expect(result.data.rejectionReason).toContain(
      "MISSING_ACCOUNT_CONVERSION_RATE"
    );
  });

  it("EURGBP on a USD account is rejected when the conversion rate is missing", () => {
    const result = evaluateRisk({
      entry: 0.85,
      stop: 0.845,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: EURGBP_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
    });
    expect(result.data.approved).toBe(false);
    expect(result.data.positionSize).toBe(0);
    expect(result.data.rejectionReason).toContain(
      "MISSING_ACCOUNT_CONVERSION_RATE"
    );
  });

  it.each([0, -1 / 150, Number.NaN])(
    "rejects an invalid conversion rate %s on a cross-currency pair",
    (rate) => {
      const result = evaluateRisk({
        entry: 150.0,
        stop: 149.5,
        accountBalance: 10_000,
        riskPercent: 0.5,
        instrument: USDJPY_USD,
        direction: "LONG",
        accountCurrency: ACCOUNT_USD,
        quoteToAccountConversionRate: rate,
      });
      expect(result.data.approved).toBe(false);
      expect(result.data.positionSize).toBe(0);
      expect(result.data.rejectionReason).toContain(
        "INVALID_ACCOUNT_CONVERSION_RATE"
      );
    }
  );

  it("ignores a valid supplied rate on a same-currency pair and forces 1", () => {
    // EURUSD quotes in USD and the account is USD, so conversion is unnecessary:
    // the effective rate is 1 by definition no matter what the caller passes.
    // A supplied rate must never rescale a same-currency leg, so a rate of 0.5
    // has to size identically to omitting the rate entirely.
    const omitted = evaluateRisk({
      entry: 1.1,
      stop: 1.095,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: EURUSD_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
    });
    const supplied = evaluateRisk({
      entry: 1.1,
      stop: 1.095,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: EURUSD_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
      quoteToAccountConversionRate: 0.5,
    });
    expect(omitted.data.approved).toBe(true);
    expect(supplied.data.approved).toBe(true);
    expect(supplied.data.rejectionReason).toBeNull();
    expect(supplied.data.positionSize).toBeCloseTo(omitted.data.positionSize, 6);
    expect(supplied.data.positionSize).toBeCloseTo(0.09, 6);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "ignores an invalid supplied rate (%s) on a same-currency pair",
    (rate) => {
      // Conversion is unnecessary when the quote currency equals the account
      // currency, so even a zero, negative, NaN or non-finite supplied rate can
      // neither affect sizing nor reject the trade.
      const omitted = evaluateRisk({
        entry: 1.1,
        stop: 1.095,
        accountBalance: 10_000,
        riskPercent: 0.5,
        instrument: EURUSD_USD,
        direction: "LONG",
        accountCurrency: ACCOUNT_USD,
      });
      const supplied = evaluateRisk({
        entry: 1.1,
        stop: 1.095,
        accountBalance: 10_000,
        riskPercent: 0.5,
        instrument: EURUSD_USD,
        direction: "LONG",
        accountCurrency: ACCOUNT_USD,
        quoteToAccountConversionRate: rate,
      });
      expect(supplied.data.approved).toBe(true);
      expect(supplied.data.rejectionReason).toBeNull();
      expect(supplied.data.positionSize).toBeCloseTo(
        omitted.data.positionSize,
        6
      );
      expect(supplied.data.positionSize).toBeCloseTo(0.09, 6);
    }
  );

  it("emits ACCOUNT_CONVERSION_NOT_REQUIRED evidence on a same-currency pair", () => {
    const result = evaluateRisk({
      entry: 1.1,
      stop: 1.095,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: EURUSD_USD,
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
    });
    const conversion = result.evidence.find(
      (item) => item.code === "ACCOUNT_CONVERSION_NOT_REQUIRED"
    );
    expect(conversion).toBeDefined();
    expect(conversion?.value).toBe(1);
    expect(result.evidence.some((item) => item.code === "ACCOUNT_CONVERSION")).toBe(false);
  });
});

describe("evaluateRisk - rounding never exceeds the requested monetary risk", () => {
  const cases: Array<{
    name: string;
    instrument: CurrencyPair;
    entry: number;
    stop: number;
    rate: number;
  }> = [
    { name: "EURUSD/USD", instrument: EURUSD_USD, entry: 1.1, stop: 1.095, rate: 1 },
    { name: "USDJPY/USD", instrument: USDJPY_USD, entry: 150, stop: 149.5, rate: 1 / 150 },
    { name: "EURGBP/USD", instrument: EURGBP_USD, entry: 0.85, stop: 0.845, rate: 1.27 },
    { name: "GBPJPY/USD", instrument: GBPJPY_USD, entry: 190, stop: 189, rate: 1 / 190 },
  ];

  it.each(cases)(
    "$name: sized risk stays within the requested capital",
    ({ instrument, entry, stop, rate }) => {
      const result = evaluateRisk({
        entry,
        stop,
        accountBalance: 10_000,
        riskPercent: 0.5,
        instrument,
        direction: "LONG",
        accountCurrency: ACCOUNT_USD,
        quoteToAccountConversionRate: rate,
      });
      expect(result.data.approved).toBe(true);
      expect(result.data.positionSize).toBeGreaterThan(0);

      const riskCapital = result.data.riskCapital;
      const consumed = actualRisk(
        result.data.positionSize,
        result.data.stopDistancePips,
        instrument,
        rate
      );
      expect(consumed).toBeLessThanOrEqual(riskCapital + 1e-9);

      // The position must be an exact multiple of the broker lot step.
      const steps = result.data.positionSize / (instrument.lotStep ?? 0.01);
      expect(steps).toBeCloseTo(Math.round(steps), 6);
    }
  );
});

describe("evaluateRisk - broker lot metadata", () => {
  it("rounds the raw size down to the lot step", () => {
    const result = evaluateRisk({
      entry: 1.1,
      stop: 1.095,
      accountBalance: 10_000,
      riskPercent: 2,
      instrument: pair({ code: "STEP", quote: "USD", lotStep: 0.1 }),
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
      quoteToAccountConversionRate: 1,
    });
    expect(result.data.approved).toBe(true);
    expect(result.data.positionSize).toBeCloseTo(0.3, 6);
  });

  it("rejects a size below the minimum lot instead of rounding up", () => {
    const result = evaluateRisk({
      entry: 1.1,
      stop: 1.095,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: pair({ code: "MIN", quote: "USD", minLot: 1.0 }),
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
      quoteToAccountConversionRate: 1,
    });
    expect(result.data.positionSize).toBe(0);
    expect(result.data.approved).toBe(false);
    expect(result.data.rejectionReason).toContain("POSITION_TOO_SMALL");
  });

  it("caps the size at the maximum lot", () => {
    const result = evaluateRisk({
      entry: 1.1,
      stop: 1.095,
      accountBalance: 10_000,
      riskPercent: 0.5,
      instrument: pair({ code: "MAX", quote: "USD", maxLot: 0.05 }),
      direction: "LONG",
      accountCurrency: ACCOUNT_USD,
      quoteToAccountConversionRate: 1,
    });
    expect(result.data.positionSize).toBeCloseTo(0.05, 6);
    expect(result.data.approved).toBe(true);
    expect(result.data.positionSize).toBeLessThanOrEqual(0.05);
  });
});
