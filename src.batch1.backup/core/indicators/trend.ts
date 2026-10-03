import type { OHLCV } from "@/types/market";
import { trueRange } from "./volatility";

export interface AdxResult {
  adx: number[];
  plusDI: number[];
  minusDI: number[];
}

/**
 * Average Directional Index with +DI / -DI (Wilder smoothing).
 *
 * Index-aligned with the candles. Indices before `period` return 0 - there is
 * genuinely no trend strength measurable from fewer than `period` bars.
 */
export function adx(candles: OHLCV[], period = 14): AdxResult {
  const n = candles.length;
  const adxOut: number[] = new Array<number>(n).fill(0);
  const plusDIOut: number[] = new Array<number>(n).fill(0);
  const minusDIOut: number[] = new Array<number>(n).fill(0);
  if (n < 2) return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };

  const tr: number[] = new Array<number>(n).fill(0);
  const plusDM: number[] = new Array<number>(n).fill(0);
  const minusDM: number[] = new Array<number>(n).fill(0);

  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const up = c.high - p.high;
    const down = p.low - c.low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = trueRange(candles, i);
  }

  let trSmooth = 0;
  let plusSmooth = 0;
  let minusSmooth = 0;
  let adxSmooth = 0;
  const dxHistory: number[] = [];

  for (let i = 1; i < n; i++) {
    if (i < period) {
      trSmooth += tr[i];
      plusSmooth += plusDM[i];
      minusSmooth += minusDM[i];
      continue;
    }
    if (i === period) {
      trSmooth += tr[i];
      plusSmooth += plusDM[i];
      minusSmooth += minusDM[i];
    } else {
      trSmooth = trSmooth - trSmooth / period + tr[i];
      plusSmooth = plusSmooth - plusSmooth / period + plusDM[i];
      minusSmooth = minusSmooth - minusSmooth / period + minusDM[i];
    }

    const plusDI = trSmooth === 0 ? 0 : (100 * plusSmooth) / trSmooth;
    const minusDI = trSmooth === 0 ? 0 : (100 * minusSmooth) / trSmooth;
    plusDIOut[i] = plusDI;
    minusDIOut[i] = minusDI;

    const denom = plusDI + minusDI;
    const dx = denom === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / denom;
    dxHistory.push(dx);

    if (dxHistory.length === period) {
      adxSmooth =
        dxHistory.reduce((acc, v) => acc + v, 0) / period;
      adxOut[i] = adxSmooth;
    } else if (dxHistory.length > period) {
      adxSmooth = (adxSmooth * (period - 1) + dx) / period;
      adxOut[i] = adxSmooth;
    }
  }

  return { adx: adxOut, plusDI: plusDIOut, minusDI: minusDIOut };
}
