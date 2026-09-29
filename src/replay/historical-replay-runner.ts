import { DEFAULT_ACCOUNT } from "@/config/scanner";
import { TableAccountConversionResolver } from "@/market-data/account-conversion";
import { createInMemoryRepositories } from "@/repositories/in-memory";
import { HistoricalReplayProvider } from "@/replay/historical-replay-provider";
import { HistoricalExecutionSimulator } from "@/replay/historical-execution-simulator";
import { HistoricalReplayClock } from "@/replay/replay-clock";
import type {
  ReplayDataset,
  ReplayRunConfig,
  ReplayRunResult,
  ReplayStep,
  ReplayStepHandler,
} from "@/replay/types";
import { ScannerApi } from "@/scanner/scanner-api";

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
  >;
  private readonly provider: HistoricalReplayProvider;
  private readonly scannerApi: ScannerApi;
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
    };

    this.provider = new HistoricalReplayProvider(dataset);
    this.executionSimulator = config.execution?.enabled
      ? new HistoricalExecutionSimulator({
          dataset,
          initialBalance: this.config.accountBalance,
          config: config.execution,
        })
      : null;
    this.scannerApi = new ScannerApi(
      {
        providerId: this.provider.id,
        executionMode: "PAPER",
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

    for (const asOf of clock) {
      const snapshot = await this.scannerApi.runScan(asOf);
      const step: ReplayStep = { index, asOf, snapshot };

      if (firstStepAt === null) firstStepAt = asOf;
      lastStepAt = asOf;

      this.executionSimulator?.processStep(step);

      if (collectSteps) {
        steps.push(step);
      }
      if (options?.onStep) {
        await options.onStep(step);
      }

      index += 1;
    }

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
      execution: this.executionSimulator?.getSummary() ?? null,
    };
  }
}
