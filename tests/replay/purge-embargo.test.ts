import { describe, expect, it } from "vitest";
import {
  calculateSequentialValidation,
  calculateTemporalHoldout,
} from "@/replay/robustness-validation";
import type { BacktestRunArtifact } from "@/replay/backtest-run-types";
import type { HistoricalTrade } from "@/replay/execution-types";

const DAY = 86_400_000;

interface TradeSpec {
  openedAt: number;
  closedAt: number;
  pnl: number;
}

function trade(spec: TradeSpec, id: number): HistoricalTrade {
  return {
    id: "t" + id,
    orderId: "o" + id,
    positionId: "p" + id,
    signalId: "s" + id,
    symbol: "EURUSD",
    side: "LONG",
    entryPrice: 1.1,
    exitPrice: 1.1 + spec.pnl / 10_000,
    stopLoss: 1.099,
    takeProfit: null,
    positionSize: 0.1,
    riskAmount: 10,
    riskPercent: 0.5,
    plannedRR: null,
    realizedPnL: spec.pnl,
    realizedPnLPercent: spec.pnl / 100,
    realizedR: spec.pnl / 10,
    maxFavorableR: spec.pnl / 10,
    maxAdverseR: 0,
    openedAt: spec.openedAt,
    closedAt: spec.closedAt,
    holdingDurationMs: spec.closedAt - spec.openedAt,
    closeReason: "STOP_LOSS",
    engine: {
      strategyId: "TEST",
      bias: "LONG",
      setupScore: 80,
      executionDecision: "EXECUTE",
      freshness: "FRESH",
    },
  } as unknown as HistoricalTrade;
}

function artifact(
  startAt: number,
  endAt: number,
  specs: TradeSpec[]
): BacktestRunArtifact {
  const trades = specs.map((s, i) => trade(s, i));
  return {
    config: { startAt, endAt },
    execution: { trades },
  } as unknown as BacktestRunArtifact;
}

describe("calculateTemporalHoldout purge (H4-4)", () => {
  const startAt = 0;
  const endAt = 100 * DAY;

  it("purges boundary-spanning trades from in-sample when purge=true", () => {
    const a = artifact(startAt, endAt, [
      { openedAt: 60 * DAY, closedAt: 80 * DAY, pnl: 5 },
    ]);
    const r = calculateTemporalHoldout(a, 0.7, { purge: true });
    expect(r.inSample.metrics.sampleSize).toBe(0);
    expect(r.outOfSample.metrics.sampleSize).toBe(0);
  });

  it("keeps fully in-sample trades when purge=true", () => {
    const a = artifact(startAt, endAt, [
      { openedAt: 10 * DAY, closedAt: 20 * DAY, pnl: 5 },
      { openedAt: 50 * DAY, closedAt: 60 * DAY, pnl: 5 },
    ]);
    const r = calculateTemporalHoldout(a, 0.7, { purge: true });
    expect(r.inSample.metrics.sampleSize).toBe(2);
    expect(r.outOfSample.metrics.sampleSize).toBe(0);
  });

  it("keeps boundary-spanning trades when purge=false (legacy)", () => {
    const a = artifact(startAt, endAt, [
      { openedAt: 60 * DAY, closedAt: 80 * DAY, pnl: 5 },
    ]);
    const r = calculateTemporalHoldout(a, 0.7, { purge: false });
    expect(r.inSample.metrics.sampleSize).toBe(1);
    expect(r.outOfSample.metrics.sampleSize).toBe(0);
  });

  it("embargoMs shifts the out-of-sample start", () => {
    const a = artifact(startAt, endAt, [
      { openedAt: 71 * DAY, closedAt: 72 * DAY, pnl: 5 },
      { openedAt: 80 * DAY, closedAt: 81 * DAY, pnl: 5 },
    ]);
    const noEmbargo = calculateTemporalHoldout(a, 0.7, { embargoMs: 0 });
    const withEmbargo = calculateTemporalHoldout(a, 0.7, {
      embargoMs: 5 * DAY,
    });
    expect(noEmbargo.outOfSample.metrics.sampleSize).toBe(2);
    expect(withEmbargo.outOfSample.metrics.sampleSize).toBe(1);
  });
});

describe("calculateSequentialValidation purge (H4-4)", () => {
  const startAt = 0;
  const endAt = 100 * DAY;

  it("drops development trades that close after validation starts", () => {
    const a = artifact(startAt, endAt, [
      { openedAt: 15 * DAY, closedAt: 25 * DAY, pnl: 5 },
    ]);
    const r = calculateSequentialValidation(a, 4, { purge: true });
    const fold1 = r.folds[0];
    expect(fold1.development.sampleSize).toBe(0);
    expect(fold1.validation.sampleSize).toBe(0);
  });

  it("keeps same trades when purge=false", () => {
    const a = artifact(startAt, endAt, [
      { openedAt: 15 * DAY, closedAt: 25 * DAY, pnl: 5 },
    ]);
    const r = calculateSequentialValidation(a, 4, { purge: false });
    expect(r.folds[0].development.sampleSize).toBe(1);
  });

  it("embargo shifts the validation start within each fold", () => {
    const a = artifact(startAt, endAt, [
      { openedAt: 21 * DAY, closedAt: 22 * DAY, pnl: 5 },
    ]);
    const noEmb = calculateSequentialValidation(a, 4, { embargoMs: 0 });
    const emb = calculateSequentialValidation(a, 4, { embargoMs: 5 * DAY });
    expect(noEmb.folds[0].validation.sampleSize).toBe(1);
    expect(emb.folds[0].validation.sampleSize).toBe(0);
  });
});