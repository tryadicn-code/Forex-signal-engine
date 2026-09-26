import { describe, expect, it } from "vitest";
import {
  adx,
  atr,
  bollingerBandWidth,
  ema,
  macd,
  rsi,
  sma,
} from "@/core/indicators";
import {
  bearishTrend,
  bullishTrend,
  rangeSeries,
} from "../fixtures/candles";

describe("ema", () => {
  it("returns an array the same length as the input", () => {
    const values = bullishTrend(50).map((c) => c.close);
    expect(ema(values, 20).length).toBe(values.length);
  });

  it("returns an empty array for an empty input", () => {
    expect(ema([], 10)).toEqual([]);
  });

  it("is finite at every index, including the warm-up region", () => {
    const values = rangeSeries(30).map((c) => c.close);
    const result = ema(values, 20);
    for (const value of result) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("lags behind a rising series", () => {
    const values = bullishTrend(100).map((c) => c.close);
    const result = ema(values, 20);
    const lastEma = result[result.length - 1];
    const lastPrice = values[values.length - 1];
    expect(lastEma).toBeLessThan(lastPrice);
    expect(lastEma).toBeGreaterThan(values[0]);
  });

  it("is deterministic: the same input yields the same output", () => {
    const values = rangeSeries(60).map((c) => c.close);
    expect(ema(values, 20)).toEqual(ema(values, 20));
  });

  it("equals the seed SMA at the first full period", () => {
    const values = [1, 2, 3, 4, 5];
    const result = ema(values, 5);
    expect(result[4]).toBeCloseTo(3, 10);
  });
});

describe("sma", () => {
  it("computes a simple average over the period", () => {
    expect(sma([2, 4, 6, 8], 2)).toEqual([2, 3, 5, 7]);
  });
});

describe("rsi", () => {
  it("stays within 0 and 100", () => {
    const result = rsi(bullishTrend(100), 14);
    for (const value of result) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it("reports high values in a strong uptrend", () => {
    const result = rsi(bullishTrend(150), 14);
    expect(result[result.length - 1]).toBeGreaterThan(60);
  });

  it("reports low values in a strong downtrend", () => {
    const result = rsi(bearishTrend(150), 14);
    expect(result[result.length - 1]).toBeLessThan(40);
  });

  it("is neutral (50) during the warm-up region", () => {
    const result = rsi(rangeSeries(10), 14);
    for (const value of result) {
      expect(value).toBe(50);
    }
  });
});

describe("atr", () => {
  it("is positive for a series with any range at all", () => {
    const result = atr(rangeSeries(100), 14);
    expect(result[result.length - 1]).toBeGreaterThan(0);
  });

  it("rises when candle ranges widen", () => {
    const calm = atr(rangeSeries(100, 1.1, 0.001), 14);
    const wild = atr(rangeSeries(100, 1.1, 0.02), 14);
    expect(wild[wild.length - 1]).toBeGreaterThan(calm[calm.length - 1]);
  });
});

describe("adx", () => {
  it("is higher in a trend than in a range", () => {
    const trending = adx(bullishTrend(150), 14);
    const ranging = adx(rangeSeries(150), 14);
    expect(trending.adx[trending.adx.length - 1]).toBeGreaterThan(
      ranging.adx[ranging.adx.length - 1]
    );
  });

  it("keeps +DI above -DI in an uptrend", () => {
    const result = adx(bullishTrend(150), 14);
    const i = result.adx.length - 1;
    expect(result.plusDI[i]).toBeGreaterThan(result.minusDI[i]);
  });

  it("keeps -DI above +DI in a downtrend", () => {
    const result = adx(bearishTrend(150), 14);
    const i = result.adx.length - 1;
    expect(result.minusDI[i]).toBeGreaterThan(result.plusDI[i]);
  });

  it("produces aligned arrays", () => {
    const result = adx(rangeSeries(60), 14);
    expect(result.adx.length).toBe(60);
    expect(result.plusDI.length).toBe(60);
    expect(result.minusDI.length).toBe(60);
  });
});

describe("macd", () => {
  it("produces aligned macd, signal and histogram arrays", () => {
    const values = bullishTrend(100).map((c) => c.close);
    const result = macd(values);
    expect(result.macd.length).toBe(values.length);
    expect(result.signal.length).toBe(values.length);
    expect(result.histogram.length).toBe(values.length);
  });

  it("reports a positive MACD line in a strong uptrend", () => {
    const values = bullishTrend(150).map((c) => c.close);
    const result = macd(values);
    // The MACD line (fast EMA minus slow EMA) is the directional signal. It is
    // positive across the whole recent tail of a strong uptrend, so a robust
    // direction check asserts the tail rather than one phase-dependent bar.
    const tail = result.macd.slice(-50);
    for (const value of tail) expect(value).toBeGreaterThan(0);
  });

  it("reports a negative MACD line in a strong downtrend", () => {
    const values = bearishTrend(150).map((c) => c.close);
    const result = macd(values);
    const tail = result.macd.slice(-50);
    for (const value of tail) expect(value).toBeLessThan(0);
  });

  it("computes the histogram as macd minus signal at every index", () => {
    const values = bearishTrend(150).map((c) => c.close);
    const result = macd(values);
    // The histogram is a momentum accelerator, not a direction flag: with a
    // sinusoidal fixture it legitimately crosses zero as the trend decelerates.
    // Its definition, however, must hold exactly everywhere.
    for (let i = 0; i < result.histogram.length; i++) {
      expect(result.histogram[i]).toBeCloseTo(
        result.macd[i] - result.signal[i],
        10
      );
    }
  });
});

describe("bollingerBandWidth", () => {
  it("is wider for a volatile series than a calm one", () => {
    const calm = bollingerBandWidth(
      rangeSeries(120, 1.1, 0.001).map((c) => c.close),
      20,
      2
    );
    const wild = bollingerBandWidth(
      rangeSeries(120, 1.1, 0.03).map((c) => c.close),
      20,
      2
    );
    expect(wild[wild.length - 1]).toBeGreaterThan(calm[calm.length - 1]);
  });

  it("never returns NaN", () => {
    const result = bollingerBandWidth(
      rangeSeries(30).map((c) => c.close),
      20,
      2
    );
    for (const value of result) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
