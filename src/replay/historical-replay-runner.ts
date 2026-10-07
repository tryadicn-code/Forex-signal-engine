import { DEFAULT_ACCOUNT } from "@/config/scanner";
import { TableAccountConversionResolver } from "@/market-data/account-conversion";
import { createInMemoryRepositories } from "@/repositories/in-memory";
import { HistoricalReplayProvider } from "@/replay/historical-replay-provider";
import { HistoricalExecutionSimulator } from "@/replay/historical-execution-simulator";
import { calculateHistoricalAnalytics } from "@/replay/backtest-analytics";
import { HistoricalReplayClock } from "@/replay/replay-clock";
import { isFxMarketOpen } from "@/replay/trading-hours";
import type {
  ReplayDataset,
  ReplayRunConfig,
  ReplayRunResult,
  ReplayStep,
  ReplayStepHandler,
} from "@/replay/types";
import { ScannerApi } from "@/scanner/scanner-api";
import type { DeepPartial, EngineConfig } from "@/core/config/engine-config";
import {
  setDeterministicMode,
  isDeterministicMode,
} from "@/core/indicators/series";

/**
 * Phase 5.1 historical replay orchestrator.
 *
 * It reuses the existing ScannerApi and therefore the existing FSE pipeline.
 * It intentionally does NOT import or call PaperTradingService. Historical
 * replay state lives in fresh in-memory repositories owned by this runner.
 */
export class HistoricalReplayRunner {
  private readonly dataset: ReplayDataset;
  private readonly config: Required<
    Pick<
      ReplayRunConfig,
      | "startAt"
      | "endAt"
      | "stepTimeframe"
      | "symbols"
      | "candleLookback"
      | "accountBalance"
      | "accountCurrency"
      | "riskPercent"
    >
  > & { skipNonTradingHours: boolean };
  private readonly provider: HistoricalReplayProvider;
  private readonly scannerApi: ScannerApi;
  /** TRD-007: engine config override, passed through to ScannerApi. */
  private readonly engineConfigOverrides: DeepPartial<EngineConfig> | undefined;
  private readonly executionSimulator: HistoricalExecutionSimulator | null;

  constructor(dataset: ReplayDataset, config: ReplayRunConfig) {
    const symbols = config.symbols ?? Object.keys(dataset.symbols);
    if (symbols.length === 0) {
      throw new Error("Replay run requires at least one symbol.");
    }
    for (const symbol of symbols) {
      if (!dataset.symbols[symbol]) {
        throw new Error("Replay run requested symbol not present in dataset: " + symbol + ".");
      }
    }

    this.dataset = dataset;
    this.config = {
      startAt: config.startAt,
      endAt: config.endAt,
      stepTimeframe: config.stepTimeframe ?? "M15",
      symbols: [...symbols],
      candleLookback: config.candleLookback ?? 220,
      accountBalance: config.accountBalance ?? DEFAULT_ACCOUNT.balance,
      accountCurrency: config.accountCurrency ?? DEFAULT_ACCOUNT.currency,
      riskPercent: config.riskPercent ?? DEFAULT_ACCOUNT.riskPercent,
      // B3-M1: default false to preserve legacy behaviour.
      skipNonTradingHours: config.skipNonTradingHours ?? false,
    } as typeof this.config;

    this.provider = new HistoricalReplayProvider(dataset);
    this.executionSimulator = config.execution?.enabled
      ? new HistoricalExecutionSimulator({
          dataset,
          initialBalance: this.config.accountBalance,
          config: config.execution,
        })
      : null;
    this.engineConfigOverrides = (config as { engineConfigOverrides?: DeepPartial<EngineConfig> })
      .engineConfigOverrides;
        this.scannerApi = new ScannerApi(
      {
        providerId: this.provider.id,
        // B3-H2: default PAPER preserves legacy behaviour, but real backtests
        // should pass executionMode: "LIVE" so the strategy enforces the
        // stricter live confirmation window (B2-H4) and the release gate
        // reflects realistic trade counts.
        executionMode:
          (config as { executionMode?: "SIGNAL_ONLY" | "PAPER" | "LIVE" })
            .executionMode ?? "PAPER",
        engineConfig: this.engineConfigOverrides,
                symbols: this.config.symbols,
        candleLookback: this.config.candleLookback,
        account: {
          balance: this.config.accountBalance,
          currency: this.config.accountCurrency,
          riskPercent: this.config.riskPercent,
        },
      },
      {
        marketData: this.provider,
        conversionResolver: new TableAccountConversionResolver(
          dataset.conversionRates ?? {}
        ),
        repositories: createInMemoryRepositories(),
      }
    );
  }

  /** Isolated scanner instance, useful for validation/audit inspection. */
  get scanner(): ScannerApi {
    return this.scannerApi;
  }

  get marketData(): HistoricalReplayProvider {
    return this.provider;
  }

  async run(options?: {
    onStep?: ReplayStepHandler;
    collectSteps?: boolean;
  }): Promise<ReplayRunResult> {
    // H4-5: replay must be deterministic. Any engineTimestamp() call without
    // marketAsOf would otherwise silently substitute the wall clock and break
    // reproducibility. Scope the flag to this run() so a same-process live
    // scanner is not affected.
    const previousMode = isDeterministicMode();
    setDeterministicMode(true);
    try {
      return await this.runInternal(options);
    } finally {
      setDeterministicMode(previousMode);
    }
  }

  private async runInternal(options?: {
    onStep?: ReplayStepHandler;
    collectSteps?: boolean;
  }): Promise<ReplayRunResult> {
    const clock = new HistoricalReplayClock({
      startAt: this.config.startAt,
      endAt: this.config.endAt,
      stepTimeframe: this.config.stepTimeframe,
    });
    const collectSteps = options?.collectSteps ?? true;
    const steps: ReplayStep[] = [];
    let index = 0;
    let firstStepAt: number | null = null;
    let lastStepAt: number | null = null;

    let skippedNonTrading = 0;
    for (const asOf of clock) {
      // B3-M1: skip bars outside the FX trading window. This avoids phantom
      // signals from a closed Saturday session and keeps signal aging
      // measured in real trading hours.
      if (this.config.skipNonTradingHours && !isFxMarketOpen(asOf)) {
        skippedNonTrading += 1;
        continue;
      }
      // Candle exits at this boundary are realized BEFORE evaluating new
      // signals at the same market time. The existing Risk Engine therefore
      // sizes new entries from the correct realized historical balance.
      if (this.executionSimulator) {
        const beforeScan = this.executionSimulator.advanceTo(asOf);
        this.scannerApi.setRuntimeAccountBalance(beforeScan.balance);
      }

      const snapshot = await this.scannerApi.runScan(asOf);
      const step: ReplayStep = { index, asOf, snapshot };

      if (firstStepAt === null) firstStepAt = asOf;
      lastStepAt = asOf;

      this.executionSimulator?.consumeStep(step);

      if (collectSteps) {
        steps.push(step);
      }
      if (options?.onStep) {
        await options.onStep(step);
      }

      index += 1;
    }

    if (skippedNonTrading > 0) {
      console.warn(
        "[HistoricalReplayRunner] skipped " +
          skippedNonTrading +
          " timestamp(s) outside the FX trading window."
      );
    }

    const execution = this.executionSimulator?.getSummary() ?? null;

    return {
      datasetId: this.dataset.id,
      ...(this.dataset.source ? { source: this.dataset.source } : {}),
      startAt: this.config.startAt,
      endAt: this.config.endAt,
      stepTimeframe: this.config.stepTimeframe,
      stepCount: index,
      firstStepAt,
      lastStepAt,
      steps,
      execution,
      analytics:
        execution === null
          ? null
          : calculateHistoricalAnalytics(execution),
    };
  }
}
