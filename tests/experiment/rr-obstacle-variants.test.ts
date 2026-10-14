// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HistoricalReplayRunner } from "@/replay/historical-replay-runner";
import { calculateHistoricalAnalytics } from "@/replay/backtest-analytics";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import { loadCsvDataset, type LoadedDataset } from "./helpers/load-csv-dataset";

const RUN_EXPERIMENT = !!process.env.RR_EXPERIMENT;
const CSV_DIR = process.env.RR_CSV_DIR ?? "C:\\mt5csvexport";
const OUT_DIR =
  process.env.RR_OUT_DIR ??
  path.resolve(process.cwd(), "experiments", "rr-obstacle-variants");
const SMOKE = !!process.env.RR_SMOKE;
const WINDOW_DAYS = process.env.RR_WINDOW_DAYS
  ? Number(process.env.RR_WINDOW_DAYS)
  : null;

const PRIMARY_SYMBOLS = ["USDJPY", "AUDCAD"];
const AUXILIARY_SYMBOLS = ["USDCAD"];
const ACCOUNT_BALANCE = 10_000;
const RISK_PERCENT = 0.5;
const ASSUMED_SPREAD_PIPS = 1.0;

interface VariantSpec {
  id: string;
  minRR: number;
  structuralTargetBufferPips: number;
  purpose: string;
}

const VARIANTS: VariantSpec[] = [
  { id: "A", minRR: 2.0, structuralTargetBufferPips: 2, purpose: "Baseline" },
  { id: "A1", minRR: 1.5, structuralTargetBufferPips: 2, purpose: "Ambang rendah" },
  { id: "A2", minRR: 1.75, structuralTargetBufferPips: 2, purpose: "Ambang menengah" },
  { id: "A3", minRR: 2.25, structuralTargetBufferPips: 2, purpose: "Ambang lebih ketat" },
  { id: "A4", minRR: 2.5, structuralTargetBufferPips: 2, purpose: "Ambang paling ketat" },
  { id: "A5", minRR: 2.0, structuralTargetBufferPips: 0, purpose: "Buffer nol" },
  { id: "A6", minRR: 2.0, structuralTargetBufferPips: 4, purpose: "Buffer lebih lebar" },
];

const TIMEZONE_OFFSETS = [0, 120, 180];

interface SegmentOutput {
  key: string;
  label: string;
  sampleSize: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancyR: number | null;
  netR: number;
}

interface RunOutput {
  variantId: string;
  utcOffsetMinutes: number;
  runAt: string;
  spec: VariantSpec;
  dataset: {
    primarySymbols: string[];
    auxiliarySymbols: string[];
    startAt: number;
    endAt: number;
    candleCount: Record<string, Record<string, number>>;
  };
  funnel: {
    orderCount: number;
    filledOrders: number;
    rejectedOrders: number;
    rejectionReasons: Record<string, number>;
    closedTrades: number;
  };
  analytics: {
    sampleSize: number;
    wins: number;
    losses: number;
    breakEven: number;
    winRate: number | null;
    profitFactor: number | null;
    expectancyR: number | null;
    averageR: number | null;
    medianR: number | null;
    netR: number;
    netReturnPercent: number;
    maxEquityDrawdownPercent: number;
    maxBalanceDrawdownPercent: number;
    averageHoldingTimeMs: number | null;
    bestTradeR: number | null;
    worstTradeR: number | null;
  };
  byStrategy: SegmentOutput[];
  bySymbol: SegmentOutput[];
}

function segmentOutput(segment: {
  key: string;
  label: string;
  sampleSize: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancyR: number | null;
  netR: number;
}): SegmentOutput {
  return {
    key: segment.key,
    label: segment.label,
    sampleSize: segment.sampleSize,
    winRate: segment.winRate,
    profitFactor: segment.profitFactor,
    expectancyR: segment.expectancyR,
    netR: segment.netR,
  };
}

async function runOne(
  loaded: LoadedDataset,
  spec: VariantSpec,
  utcOffsetMinutes: number
): Promise<RunOutput> {
  const overrides: DeepPartial<EngineConfig> = {
    risk: {
      minRR: spec.minRR,
      structuralTargetBufferPips: spec.structuralTargetBufferPips,
    },
  };

  const commonStartAt = loaded.validation.commonStartAt;
  const commonEndAt = loaded.validation.commonEndAt;
  if (commonStartAt === null || commonEndAt === null) {
    throw new Error("Dataset missing common coverage window.");
  }
  const startAt =
    WINDOW_DAYS !== null
      ? Math.max(commonStartAt, commonEndAt - WINDOW_DAYS * 24 * 60 * 60_000)
      : commonStartAt;
  const endAt = commonEndAt;

  const runner = new HistoricalReplayRunner(loaded.dataset, {
    startAt,
    endAt,
    stepTimeframe: "M15",
    executionMode: "LIVE",
    accountBalance: ACCOUNT_BALANCE,
    riskPercent: RISK_PERCENT,
    engineConfigOverrides: overrides,
    execution: {
      enabled: true,
      executionTimeframe: "M15",
      intrabarConflictPolicy: "STOP_FIRST",
      maxOpenPositions: 10,
      maxTotalOpenRiskPercent: 5,
      applySpread: true,
    },
  });

  let stepCount = 0;
  const result = await runner.run({
    collectSteps: false,
    onStep: async () => {
      stepCount += 1;
      if (stepCount % 100 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    },
  });
  if (!result.execution) {
    throw new Error("Replay run returned no execution summary.");
  }

  const execution = result.execution;
  const analytics = calculateHistoricalAnalytics(execution);

  const rejectionReasons: Record<string, number> = {};
  let filledOrders = 0;
  for (const order of execution.orders) {
    if (order.status === "FILLED") {
      filledOrders += 1;
    } else {
      const reason = order.rejectionReason ?? "UNKNOWN";
      rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
    }
  }

  const candleCount: Record<string, Record<string, number>> = {};
  for (const sym of PRIMARY_SYMBOLS) {
    const symbolData = loaded.dataset.symbols[sym];
    if (symbolData) {
      candleCount[sym] = {};
      for (const [tf, series] of Object.entries(symbolData.candles)) {
        candleCount[sym][tf] = series.length;
      }
    }
  }

  return {
    variantId: spec.id,
    utcOffsetMinutes,
    runAt: new Date().toISOString(),
    spec,
    dataset: {
      primarySymbols: PRIMARY_SYMBOLS,
      auxiliarySymbols: AUXILIARY_SYMBOLS,
      startAt,
      endAt,
      candleCount,
    },
    funnel: {
      orderCount: execution.orderCount,
      filledOrders,
      rejectedOrders: execution.orderCount - filledOrders,
      rejectionReasons,
      closedTrades: execution.closedTradeCount,
    },
    analytics: {
      sampleSize: analytics.sampleSize,
      wins: analytics.wins,
      losses: analytics.losses,
      breakEven: analytics.breakEven,
      winRate: analytics.winRate,
      profitFactor: analytics.profitFactor,
      expectancyR: analytics.expectancyR,
      averageR: analytics.averageR,
      medianR: analytics.medianR,
      netR: analytics.netR,
      netReturnPercent: analytics.netReturnPercent,
      maxEquityDrawdownPercent: analytics.maxEquityDrawdownPercent,
      maxBalanceDrawdownPercent: analytics.maxBalanceDrawdownPercent,
      averageHoldingTimeMs: analytics.averageHoldingTimeMs,
      bestTradeR: analytics.bestTradeR,
      worstTradeR: analytics.worstTradeR,
    },
    byStrategy: analytics.segments.byStrategy.map(segmentOutput),
    bySymbol: analytics.segments.bySymbol.map(segmentOutput),
  };
}

function fmt(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function writeSummaryMarkdown(outputs: RunOutput[], outDir: string): void {
  const byKey = new Map<string, RunOutput>();
  for (const out of outputs) {
    byKey.set(out.variantId + "_" + out.utcOffsetMinutes, out);
  }
  const primaryIds = ["A", "A1", "A2", "A3", "A4", "A5", "A6"];
  const primary = primaryIds
    .map((id) => byKey.get(id + "_0"))
    .filter((x): x is RunOutput => !!x);

  const lines: string[] = [];
  lines.push("# TRD-RR-002 Obstacle Clearance Gate Experiment Summary");
  lines.push("");
  lines.push("Run at: " + new Date().toISOString());
  lines.push("Primary symbols: " + PRIMARY_SYMBOLS.join(", "));
  lines.push(
    "Auxiliary symbols (conversion rate only): " +
      (AUXILIARY_SYMBOLS.length > 0 ? AUXILIARY_SYMBOLS.join(", ") : "(none)")
  );
  lines.push(
    "Account: " +
      ACCOUNT_BALANCE +
      " / risk " +
      RISK_PERCENT +
      "% / spread " +
      ASSUMED_SPREAD_PIPS +
      " pip (applySpread=true)"
  );
  lines.push("");
  lines.push("## Primary comparison (UTC offset 0)");
  lines.push("");
  lines.push(
    "| ID | minRR | buffer | orders | filled | rejected | trades | winRate | PF | expR | netR | maxDD% |"
  );
  lines.push(
    "|---|---|---|---|---|---|---|---|---|---|---|---|"
  );
  for (const out of primary) {
    lines.push(
      "| " +
        out.variantId +
        " | " +
        out.spec.minRR.toFixed(2) +
        " | " +
        out.spec.structuralTargetBufferPips +
        " | " +
        out.funnel.orderCount +
        " | " +
        out.funnel.filledOrders +
        " | " +
        out.funnel.rejectedOrders +
        " | " +
        out.analytics.sampleSize +
        " | " +
        fmt(out.analytics.winRate, 3) +
        " | " +
        fmt(out.analytics.profitFactor, 2) +
        " | " +
        fmt(out.analytics.expectancyR, 3) +
        " | " +
        fmt(out.analytics.netR, 2) +
        " | " +
        fmt(out.analytics.maxEquityDrawdownPercent, 2) +
        " |"
    );
  }
  lines.push("");
  lines.push("## Rejection breakdown (offset 0)");
  lines.push("");
  for (const out of primary) {
    const reasons =
      Object.entries(out.funnel.rejectionReasons)
        .map(([k, v]) => k + "=" + v)
        .join(", ") || "(none)";
    lines.push("- **" + out.variantId + "**: " + reasons);
  }
  lines.push("");
  lines.push("## Timezone sensitivity (variant A only)");
  lines.push("");
  lines.push(
    "| offset (min) | label | orders | trades | winRate | PF | expR | netR |"
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const offset of TIMEZONE_OFFSETS) {
    const out = byKey.get("A_" + offset);
    if (!out) continue;
    const label = offset === 0 ? "UTC" : "GMT+" + offset / 60;
    lines.push(
      "| " +
        offset +
        " | " +
        label +
        " | " +
        out.funnel.orderCount +
        " | " +
        out.analytics.sampleSize +
        " | " +
        fmt(out.analytics.winRate, 3) +
        " | " +
        fmt(out.analytics.profitFactor, 2) +
        " | " +
        fmt(out.analytics.expectancyR, 3) +
        " | " +
        fmt(out.analytics.netR, 2) +
        " |"
    );
  }
  lines.push("");

  const baseline = byKey.get("A_0");
  if (baseline) {
    lines.push("## Per-strategy breakdown (variant A, offset 0)");
    lines.push("");
    lines.push("| strategy | sample | winRate | PF | expR | netR |");
    lines.push("|---|---|---|---|---|---|");
    for (const seg of baseline.byStrategy) {
      lines.push(
        "| " +
          seg.key +
          " | " +
          seg.sampleSize +
          " | " +
          fmt(seg.winRate, 3) +
          " | " +
          fmt(seg.profitFactor, 2) +
          " | " +
          fmt(seg.expectancyR, 3) +
          " | " +
          fmt(seg.netR, 2) +
          " |"
      );
    }
    lines.push("");
    lines.push("## Per-symbol breakdown (variant A, offset 0)");
    lines.push("");
    lines.push("| symbol | sample | winRate | PF | expR | netR |");
    lines.push("|---|---|---|---|---|---|");
    for (const seg of baseline.bySymbol) {
      lines.push(
        "| " +
          seg.key +
          " | " +
          seg.sampleSize +
          " | " +
          fmt(seg.winRate, 3) +
          " | " +
          fmt(seg.profitFactor, 2) +
          " | " +
          fmt(seg.expectancyR, 3) +
          " | " +
          fmt(seg.netR, 2) +
          " |"
      );
    }
    lines.push("");
  }

  lines.push("## Caveats");
  lines.push("");
  lines.push(
    "- Timezone server MT5 UNVERIFIED. Sensitivity check di atas hanya untuk varian A."
  );
  lines.push(
    "- Cost model: assumption 1.0 pip spread (applySpread), commission 0, swap 0."
  );
  lines.push(
    "- Funnel live (scan -> trigger -> risk approved) TIDAK bisa direplikasi di backtest; metrik di atas execution-level."
  );
  lines.push(
    "- 4-layer minRR caveat: varian mengubah minRR = mengubah gate + derived TP1 + clearance window + veto sekaligus."
  );
  lines.push(
    "- AUDCAD: quote currency CAD. Conversion rate diambil dari USDCAD (auxiliary)."
  );
  lines.push("");

  fs.writeFileSync(path.join(outDir, "SUMMARY.md"), lines.join("\n"), "utf8");
}

describe.skipIf(!RUN_EXPERIMENT)(
  "TRD-RR-002 obstacle clearance variants",
  () => {
    it(
      "runs 7 variants with timezone sensitivity on variant A",
      async () => {
        if (!fs.existsSync(CSV_DIR)) {
          throw new Error("CSV dir not found: " + CSV_DIR);
        }
        fs.mkdirSync(OUT_DIR, { recursive: true });

        const primary = loadCsvDataset({
          dir: CSV_DIR,
          symbols: PRIMARY_SYMBOLS,
          auxiliarySymbols: AUXILIARY_SYMBOLS,
          sourceUtcOffsetMinutes: 0,
          assumedSpreadPips: ASSUMED_SPREAD_PIPS,
          datasetId: "rr-obstacle-variants-offset0",
        });

        const outputs: RunOutput[] = [];

        for (const offset of SMOKE ? [0] : TIMEZONE_OFFSETS) {
          const loaded =
            offset === 0
              ? primary
              : loadCsvDataset({
                  dir: CSV_DIR,
                  symbols: PRIMARY_SYMBOLS,
                  auxiliarySymbols: AUXILIARY_SYMBOLS,
                  sourceUtcOffsetMinutes: offset,
                  assumedSpreadPips: ASSUMED_SPREAD_PIPS,
                  datasetId: "rr-obstacle-variants-offset" + offset,
                });
          const out = await runOne(loaded, VARIANTS[0], offset);
          outputs.push(out);
          fs.writeFileSync(
            path.join(OUT_DIR, "A_offset" + offset + ".json"),
            JSON.stringify(out, null, 2),
            "utf8"
          );
        }

        for (let i = 1; i < (SMOKE ? 1 : VARIANTS.length); i += 1) {
          const spec = VARIANTS[i];
          const out = await runOne(primary, spec, 0);
          outputs.push(out);
          fs.writeFileSync(
            path.join(OUT_DIR, spec.id + "_offset0.json"),
            JSON.stringify(out, null, 2),
            "utf8"
          );
        }

        writeSummaryMarkdown(outputs, OUT_DIR);

        const a0 = outputs.find(
          (o) => o.variantId === "A" && o.utcOffsetMinutes === 0
        );
        expect(a0).toBeDefined();
      },
      90 * 60_000
    );
  }
);