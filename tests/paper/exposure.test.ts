import { describe, expect, it } from "vitest";
import {
  currencyExposureLegs,
  findDirectionalCurrencyExposureBlock,
} from "@/paper/exposure";

describe("paper directional currency exposure", () => {
  it("maps FX trade direction into base and quote exposure", () => {
    expect(currencyExposureLegs("EURJPY", "SHORT")).toEqual([
      { currency: "EUR", direction: "SHORT" },
      { currency: "JPY", direction: "LONG" },
    ]);
    expect(currencyExposureLegs("GBPJPY", "LONG")).toEqual([
      { currency: "GBP", direction: "LONG" },
      { currency: "JPY", direction: "SHORT" },
    ]);
  });

  it("blocks the third position sharing the same directional currency leg", () => {
    const block = findDirectionalCurrencyExposureBlock(
      [
        { symbol: "EURJPY", side: "SHORT" },
        { symbol: "GBPJPY", side: "SHORT" },
      ],
      "AUDJPY",
      "SHORT",
      2
    );

    expect(block).toMatchObject({
      currency: "JPY",
      direction: "LONG",
      existingCount: 2,
      limit: 2,
    });
  });

  it("allows a second same-theme position when the limit is two", () => {
    expect(
      findDirectionalCurrencyExposureBlock(
        [{ symbol: "EURJPY", side: "SHORT" }],
        "GBPJPY",
        "SHORT",
        2
      )
    ).toBeNull();
  });
});
