/**
 * Scanner service (Section 16/17 spec).
 *
 * Orchestrates one scan cycle across the configured symbol universe. Per symbol
 * the pipeline is strictly ordered:
 *
 *   fetch -> normalize -> validate -> closed-candle filter -> freshness
 *         -> MTF context -> Phase 1 orchestrator -> state derivation
 *         -> lifecycle/TTL -> result
 *
 * The service contains NO trading logic and NO Phase 1 strategy logic. It is the
 * integration layer: it converts the canonical market-data layer into the Phase 1
 * orchestrator's input, records what the engines concluded, and reports the
 * outcome as a presentation-free {@link SymbolScanResult}.
 *
 * FAILURE ISOLATION: every symbol is scanned inside its own try/catch and every
 * provider call returns a discriminated result, so one pair's failure (a dead
 * feed, malformed bars, a missing timeframe) produces a structured failure result
 * for that pair and the cycle continues with the rest.
 *
 * TIME: analysis time is injected as `asOf` and threaded everywhere, so a replay
 * at an earlier time reproduces identical results. The wall clock is used only
 * for operational health (latency, provider status), never for market decisions.
 */

import type { MarketSnapshot, Timeframe } from "@/types/market";
import type { CanonicalCandle, NewsRiskContext } from "@/types/market-data";
import type { PipelineResult } from "@/core/orchestrator";
import { analyzeMarket } from "@/core/orchestrator";
import type { Evidence, Conflict } from "@/types/engine";
import { resolveScannerConfig } from "@/config/scanner";
import type { DeepPartial } from "@/core/config/engine-config";
import type { ScannerConfig } from "@/config/scanner";
import { toCurrencyPair } from "@/config/scanner";
import { SYMBOL_METADATA } from "@/config/scanner";
import type { MarketDataProvider } from "@/providers/market-data/provider";
import { MockMarketDataProvider } from "@/providers/market-data/mock-provider";
import type { EconomicCalendarProvider } from "@/types/market-data";
import { NoopEconomicCalendarProvider } from "@/providers/economic-calendar/noop-provider";
import { TableAccountConversionResolver } from "@/market-data/account-conversion";
import type { AccountConversionResolver } from "@/market-data/account-conversion";
import {
  buildMarketContext,
  type BuildContextOutcome,
} from "@/scanner/market-context";
import {
  computeSignalIdentity,
  createLifecycle,
  isSetupExpired,
  isTriggerExpired,
  recordTransition,
  resolveLifecycleIdentity,
} from "@/scanner/signal-lifecycle";
import type { SignalLifecycleState } from "@/scanner/signal-lifecycle";
import {
  attachIdentity,
  deriveSignalState,
  deriveStateReason,
  transitionSignal,
} from "@/scanner/signal-state-machine";
import type { Freshness, SignalStateTransition } from "@/types/market-data";
import {
  failureResult,
  type ScannerHealth,
  type ScannerSnapshot,
  type SymbolScanResult,
  type SymbolScanStatus,
  type TimeframeSummary,
} from "@/scanner/scanner-result";
import type { FreshnessStatus } from "@/types/market-data";
import type { ProviderStatus } from "@/types/market-data";
import type { RepositoryBundle } from "@/repositories/in-memory";
import { createInMemoryRepositories } from "@/repositories/in-memory";

/** Constructed dependencies for the scanner, all injectable for testing. */
export interface ScannerDeps {
  marketData: MarketDataProvider;
  economicCalendar: EconomicCalendarProvider;
  conversionResolver: AccountConversionResolver;
  repositories: RepositoryBundle;
}

/**
 * The result of one symbol's analysis, before it is flattened into the
 * presentation-free {@link SymbolScanResult}. Carries the pieces the service
 * needs internally (the lifecycle, the transitions to persist).
 */
interface SymbolAnalysis {
  result: SymbolScanResult;
  lifecycle: SignalLifecycleState | null;
  /** Transitions recorded this cycle, to append to history. */
  transitions: SignalStateTransition[];
}

export class ScannerService {
  private readonly config: ScannerConfig;
  private readonly deps: ScannerDeps;

  constructor(configOverrides?: DeepPartial<ScannerConfig>, deps?: Partial<ScannerDeps>) {
    this.config = resolveScannerConfig(configOverrides);
    const marketData = deps?.marketData ?? new MockMarketDataProvider();
    this.deps = {
      marketData,
      economicCalendar: deps?.economicCalendar ?? new NoopEconomicCalendarProvider(),
      conversionResolver:
        deps?.conversionResolver ??
        new TableAccountConversionResolver(marketData instanceof MockMarketDataProvider ? marketData.getRates() : {}),
      repositories: deps?.repositories ?? createInMemoryRepositories(),
    };
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  get scannerConfig(): ScannerConfig {
    return this.config;
  }

  get repositories(): RepositoryBundle {
    return this.deps.repositories;
  }

  get marketDataProvider(): MarketDataProvider {
    return this.deps.marketData;
  }

  get economicCalendarProvider(): EconomicCalendarProvider {
    return this.deps.economicCalendar;
  }

  /**
   * Update the runtime account balance used by the existing Risk Engine.
   *
   * Phase 4 uses this only in PAPER mode so position sizing follows the
   * reconstructable paper-account balance. No strategy threshold or decision
   * logic is changed.
   */
  setRuntimeAccountBalance(balance: number): void {
    if (this.config.executionMode !== "PAPER") return;
    if (!Number.isFinite(balance) || balance <= 0) return;
    this.config.account.balance = balance;
  }

  /** Symbols the scanner will analyse; unknown symbols are rejected up front. */
  get symbols(): string[] {
    return this.config.symbols.filter((symbol) => {
      if (!(symbol in SYMBOL_METADATA)) {
        return false;
      }
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // One scan cycle
  // -------------------------------------------------------------------------

  /**
   * Run one scan cycle across the whole universe at market time `asOf`.
   *
   * `asOf` is the analysis time: only candles closed at or before it are used,
   * so a replay at an earlier `asOf` sees strictly the past.
   */
  async scanOnce(asOf: number): Promise<ScannerSnapshot> {
    const startedAt = asOf;
    const results: SymbolScanResult[] = [];
    const transitionsToAppend: SignalStateTransition[] = [];

    for (const symbol of this.symbols) {
      try {
        const analysis = await this.scanSymbol(symbol, asOf);
        results.push(analysis.result);
        transitionsToAppend.push(...analysis.transitions);
      } catch (error) {
        // Last-resort guard: a symbol must never take the cycle down with it.
        results.push(this.unexpectedFailure(symbol, asOf, error));
      }
    }

    for (const transition of transitionsToAppend) {
      this.deps.repositories.transitions.append(transition);
    }

    const successful = results.filter((r) => r.status === "ANALYSED").length;
    const snapshot: ScannerSnapshot = {
      startedAt,
      completedAt: asOf,
      durationMs: null,
      symbolsRequested: this.symbols.length,
      symbolsSuccessful: successful,
      symbolsFailed: results.length - successful,
      results,
      providerStatus: providerStatusOf(this.deps.marketData),
      freshnessSummary: summarizeFreshness(results),
    };

    this.deps.repositories.snapshots.save(snapshot);
    this.deps.repositories.health.save(this.buildHealth(snapshot));
    if (snapshot.providerStatus !== null) {
      this.deps.repositories.health.saveProviderStatus(snapshot.providerStatus);
    }

    return snapshot;
  }

  /**
   * Analyse ONE symbol end to end. Every failure path returns a structured
   * {@link SymbolScanResult}; nothing throws past this method's caller.
   */
  async scanSymbol(symbol: string, asOf: number): Promise<SymbolAnalysis> {
    if (!(symbol in SYMBOL_METADATA)) {
      return {
        result: failureResult(
          symbol,
          "PROVIDER_FAILURE",
          `Symbol ${symbol} is not in the configured universe.`,
          asOf
        ),
        lifecycle: null,
        transitions: [],
      };
    }

    const outcome: BuildContextOutcome = await buildMarketContext({
      symbol,
      provider: this.deps.marketData,
      roles: this.config.timeframeRoles,
      thresholds: this.config.freshness,
      candleLookback: this.config.candleLookback,
      accountCurrency: this.config.account.currency,
      conversionResolver: this.deps.conversionResolver,
      asOf,
      minBarsPerTimeframe: 40,
    });

    if (outcome.context === null) {
      const status: SymbolScanStatus =
        outcome.rejection === null
          ? "PROVIDER_FAILURE"
          : outcome.rejection.reason === "INSUFFICIENT_BARS" ||
            outcome.rejection.reason === "INVALID_TIMEFRAME_DATA"
            ? "INVALID_DATA"
            : "PROVIDER_FAILURE";
      const timeframeDetail = outcome.rejection?.timeframes.join(", ") ?? "";
      return {
        result: failureResult(
          symbol,
          status,
          outcome.rejection === null
            ? outcome.providerError ?? "Market context could not be built."
            : `${outcome.rejection.reason} for ${timeframeDetail}.`,
          asOf,
          outcome.providerError ? [outcome.providerError] : []
        ),
        lifecycle: null,
        transitions: [],
      };
    }

    const context = outcome.context;
    const pipeline = this.runPipeline(context, asOf);

    const news = await this.fetchNewsRisk(symbol, asOf);
    const stale = context.freshness.status === "STALE";
    const conversionUnresolved =
      context.metadata.quoteCurrency !== context.accountCurrency &&
      context.quoteToAccountConversionRate === undefined;

    // --- Identity, derived from the actual setup the engines found ----------
    const setup = pipeline.setup.data;
    const originTimeframe = this.config.timeframeRoles.setup;
    const originTimestamp = firstSetupOrigin(pipeline) ?? context.h1.asOf;
    const identity =
      setup.state !== "NONE"
        ? computeSignalIdentity({
            symbol,
            direction: pipeline.bias.data.direction,
            originTimeframe,
            originTimestamp,
            zoneLow: setup.zoneLow,
            zoneHigh: setup.zoneHigh,
            pipSize: context.metadata.pipSize,
          })
        : null;

    // --- Lifecycle + bar-aware TTL ------------------------------------------
    const { lifecycle, transitions } = this.advanceLifecycle({
      symbol,
      identity,
      pipeline,
      context,
      stale,
      conversionUnresolved,
      newsPending: news?.newsPending,
      asOf,
    });

    const result = this.toSymbolScanResult({
      symbol,
      context,
      pipeline,
      lifecycle,
      news,
      stale,
      asOf,
    });

    return { result, lifecycle, transitions };
  }

  // -------------------------------------------------------------------------
  // Phase 1 integration
  // -------------------------------------------------------------------------

  /** Convert the canonical context into the Phase 1 orchestrator's input. */
  private runPipeline(context: BuildContextOutcome["context"], asOf: number): PipelineResult {
    const instrument = toCurrencyPair(context!.metadata);
    const biasTimeframe = context!.h4.timeframe;
    const setupTimeframe = context!.h1.timeframe;
    const triggerTimeframe = context!.m15.timeframe;

    return analyzeMarket({
      instrument,
      biasTimeframe: {
        timeframe: biasTimeframe,
        snapshot: toSnapshot(context!.symbol, context!.h4),
      },
      setupTimeframe: {
        timeframe: setupTimeframe,
        snapshot: toSnapshot(context!.symbol, context!.h1),
      },
      triggerTimeframe: {
        timeframe: triggerTimeframe,
        snapshot: toSnapshot(context!.symbol, context!.m15, context!.spreadPips),
      },
      accountBalance: this.config.account.balance,
      accountCurrency: this.config.account.currency,
      riskPercent: this.config.account.riskPercent,
      quoteToAccountConversionRate: context!.quoteToAccountConversionRate,
      execution: {
        now: asOf,
        mode: this.config.executionMode,
        marketDataFreshness: context!.freshness.status,
        marketDataAgeMs: context!.freshness.ageMs,
        spreadPips: context!.spreadPips,
      },
    });
  }

  /** Fetch news risk, mapping a failed calendar call to an explicit unknown. */
  private async fetchNewsRisk(symbol: string, asOf: number): Promise<NewsRiskContext | null> {
    const result = await this.deps.economicCalendar.getNewsRisk(symbol, asOf);
    if (!result.ok) {
      return { evaluationStatus: "PROVIDER_UNAVAILABLE" };
    }
    return result.data;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Advance one signal's lifecycle, creating it on first observation and
   * applying the derived transition plus the bar-aware TTL rules.
   */
  private advanceLifecycle(input: {
    symbol: string;
    identity: ReturnType<typeof computeSignalIdentity> | null;
    pipeline: PipelineResult;
    context: BuildContextOutcome["context"];
    stale: boolean;
    conversionUnresolved: boolean;
    newsPending: boolean | undefined;
    asOf: number;
  }): { lifecycle: SignalLifecycleState | null; transitions: SignalStateTransition[] } {
    const { identity, pipeline, context, asOf } = input;
    if (identity === null) {
      return { lifecycle: null, transitions: [] };
    }

    const store = this.deps.repositories.signals;
    const latestSetupOpen = lastOpen(context!.h1.candles);
    const latestTriggerOpen = lastOpen(context!.m15.candles);
    const observedSetupOrigin = firstSetupOrigin(pipeline) ?? latestSetupOpen;
    const observedTriggerOrigin = firstTriggerOrigin(pipeline);

    // A terminal CLOSED lifecycle is never revived. If the engine observes a
    // genuinely newer trigger inside the same setup, that trigger receives a
    // deterministic occurrence id and starts a fresh lifecycle instead.
    const baseExisting = store.getById(identity.signalId);
    const lifecycleIdentity = resolveLifecycleIdentity(
      identity,
      baseExisting,
      observedTriggerOrigin
    );
    const existing = store.getById(lifecycleIdentity.signalId);
    const lifecycle =
      existing ??
      createLifecycle(lifecycleIdentity, asOf);
    const freshTriggerOccurrence =
      lifecycleIdentity.signalId !== identity.signalId;

    // Track where the current setup/trigger first appeared so TTL has an origin.
    // A fresh trigger occurrence is a NEW lifecycle: it must not inherit the
    // elapsed setup TTL of the already-closed occurrence. The old lifecycle
    // remains terminal and preserved in history.
    const setupOrigin =
      lifecycle.setupOriginTimestamp ??
      (freshTriggerOccurrence ? latestSetupOpen : observedSetupOrigin);
    const triggerOrigin =
      lifecycle.triggerOriginTimestamp ??
      observedTriggerOrigin ??
      null;

    const triggerExpired = isTriggerExpired(
      triggerOrigin,
      context!.m15.timeframe,
      latestTriggerOpen,
      this.config.signalTtl.triggerBars
    );
    const setupExpired = isSetupExpired(
      setupOrigin,
      lifecycleIdentity.originTimeframe,
      latestSetupOpen,
      this.config.signalTtl.setupBars
    );
    const expired = triggerExpired || setupExpired;
    const expiredReason = triggerExpired
      ? `Trigger TTL of ${this.config.signalTtl.triggerBars} trigger bars lapsed.`
      : setupExpired
        ? `Setup TTL of ${this.config.signalTtl.setupBars} setup bars lapsed.`
        : undefined;

    const identityNonNull = lifecycleIdentity;
    const target = deriveSignalState({
      pipeline,
      stale: input.stale,
      conversionUnresolved: input.conversionUnresolved,
      expired,
      expiredReason,
    });
    const reason = deriveStateReason({
      pipeline,
      stale: input.stale,
      conversionUnresolved: input.conversionUnresolved,
      expired,
      expiredReason,
    });

    let updated = lifecycle;
    const transitions: SignalStateTransition[] = [];
    const applied = transitionSignal(lifecycle.state, target, reason, asOf);
    const withIdentity = attachIdentity(applied.transition, identityNonNull);
    if (withIdentity !== null) {
      updated = recordTransition(lifecycle, withIdentity, asOf);
      transitions.push(withIdentity);
    }

    updated = {
      ...updated,
      setupOriginTimestamp: setupOrigin,
      triggerOriginTimestamp: triggerOrigin,
    };

    // A closed/invalidated lifecycle is terminal: keep the record for history
    // but stop tracking it as active.
    if (updated.state === "CLOSED" || updated.state === "INVALIDATED") {
      store.upsert(updated);
      return { lifecycle: updated, transitions };
    }

    store.upsert(updated);
    return { lifecycle: updated, transitions };
  }

  // -------------------------------------------------------------------------
  // Result assembly
  // -------------------------------------------------------------------------

  private toSymbolScanResult(input: {
    symbol: string;
    context: BuildContextOutcome["context"];
    pipeline: PipelineResult;
    lifecycle: SignalLifecycleState | null;
    news: NewsRiskContext | null;
    stale: boolean;
    asOf: number;
  }): SymbolScanResult {
    const { symbol, context, pipeline, lifecycle, news, asOf } = input;
    const trigger = pipeline.trigger?.data ?? null;
    const risk = pipeline.risk?.data ?? null;
    const setup = pipeline.setup.data;
    const triggerTf = context!.m15;
    const entryPrice =
      risk && triggerTf.candles.length > 0
        ? triggerTf.candles[triggerTf.candles.length - 1].close
        : null;

    return {
      symbol,
      status: "ANALYSED",
      reason: news?.evaluationStatus === "EVALUATED" && news.newsPending
        ? "Analysed; high-impact news is pending."
        : "Analysed successfully.",
      latestPrice: context!.latestPrice,
      spreadPips: context!.spreadPips ?? null,
      regime: pipeline.regime.data.regime,
      bias: pipeline.bias.data.label,
      biasScore: pipeline.bias.data.score,
      biasDirection: pipeline.bias.data.direction,
      setupState: setup.state,
      setupScore: setup.setupScore,
      triggerState: trigger?.state ?? null,
      triggerScore: trigger ? (trigger.state === "CONFIRMED" ? 100 : trigger.state === "WAITING" ? 50 : 0) : null,
      triggerAgeInBars: trigger?.ageInBars ?? null,
      riskReward: risk?.rr ?? null,
      positionSize: risk?.positionSize ?? null,
      executionDecision: pipeline.execution?.data.decision ?? null,
      signalState: lifecycle?.state ?? null,
      signalId: lifecycle?.identity.signalId ?? null,
      freshness: context!.freshness.status,
      updatedAt: asOf,
      timeframes: [
        summarizeTimeframe("macro", context!.d1),
        summarizeTimeframe("bias", context!.h4),
        summarizeTimeframe("setup", context!.h1),
        summarizeTimeframe("trigger", context!.m15),
      ],
      executionDetail: pipeline.execution?.data
        ? {
            decision: pipeline.execution.data.decision,
            conditions: pipeline.execution.data.conditions,
            triggeredVetoes: pipeline.execution.data.triggeredVetoes,
            reasons: pipeline.execution.data.reasons,
          }
        : null,
      riskDetail: pipeline.risk?.data
        ? {
            approved: pipeline.risk.data.approved,
            rejectionReason: pipeline.risk.data.rejectionReason,
            entryPrice,
            stopLoss: setup.invalidationLevel,
            stopDistancePips: pipeline.risk.data.stopDistancePips,
            takeProfit1: pipeline.risk.data.tp1,
            takeProfit2: pipeline.risk.data.tp2,
            riskCapital: pipeline.risk.data.riskCapital,
            riskPercent: this.config.account.riskPercent,
            positionSize: pipeline.risk.data.positionSize,
            plannedRR: pipeline.risk.data.rr,
            pipSize: context!.metadata.pipSize,
            accountCurrency: this.config.account.currency,
          }
        : null,
      evidence: collectEvidence(pipeline),
      conflicts: collectConflicts(pipeline),
      issues: input.stale ? staleIssue(symbol, triggerTf.timeframe, context!.freshness.ageMs) : [],
      errors: [],
    };
  }

  private unexpectedFailure(symbol: string, asOf: number, error: unknown): SymbolScanResult {
    const message = error instanceof Error ? error.message : String(error);
    return failureResult(
      symbol,
      "ANALYSIS_ERROR",
      `Unexpected error analysing ${symbol}: ${message}`,
      asOf,
      [message]
    );
  }

  private buildHealth(snapshot: ScannerSnapshot): ScannerHealth {
    const active = this.deps.repositories.signals.getAll().filter((s) => {
      const terminal = s.state === "CLOSED" || s.state === "INVALIDATED";
      return !terminal;
    }).length;

    return {
      lastScanStartedAt: snapshot.startedAt,
      lastScanCompletedAt: snapshot.completedAt,
      durationMs: snapshot.durationMs,
      symbolsRequested: snapshot.symbolsRequested,
      symbolsSuccessful: snapshot.symbolsSuccessful,
      symbolsFailed: snapshot.symbolsFailed,
      providerStatus: snapshot.providerStatus,
      freshnessSummary: snapshot.freshnessSummary,
      activeSignals: active,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSnapshot(
  symbol: string,
  tf: { timeframe: Timeframe; candles: CanonicalCandle[]; asOf: number },
  spreadPips?: number
): MarketSnapshot {
  return {
    pair: symbol,
    timeframe: tf.timeframe,
    candles: tf.candles.map((c) => ({
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    })),
    asOf: tf.asOf,
    ...(spreadPips === undefined ? {} : { spreadPips }),
  };
}

/** Presentation-only MTF summary: role + freshness + data depth. */
function summarizeTimeframe(role: TimeframeSummary["role"], tf: { timeframe: Timeframe; candles: CanonicalCandle[]; asOf: number; freshness: Freshness }): TimeframeSummary {
  return {
    role,
    timeframe: tf.timeframe,
    asOf: tf.candles.length ? tf.asOf : null,
    freshness: tf.freshness.status,
    closedCandles: tf.candles.length,
  };
}

function lastOpen(candles: CanonicalCandle[]): number {
  return candles.length ? candles[candles.length - 1].timestamp : 0;
}

/**
 * The market timestamp of the candle the current setup zone originated on.
 * Falls back to the newest setup-timeframe candle when the Setup Engine does not
 * expose an explicit origin, so identity always carries a real market time.
 */
function firstSetupOrigin(pipeline: PipelineResult): number | null {
  // The origin is the market time the current setup zone became observable: the
  // most recent CONFIRMED structure point on the setup timeframe. That is a real
  // market timestamp (never a price), so two occurrences of the same zone at
  // different times get different identities.
  const structure = pipeline.setupStructure.data;
  const confirmed = structure.structurePoints.filter((p) => p.confirmed);
  if (confirmed.length === 0) return null;
  return confirmed[confirmed.length - 1].confirmedAtTimestamp;
}

function firstTriggerOrigin(pipeline: PipelineResult): number | null {
  const trigger = pipeline.trigger?.data ?? null;
  if (!trigger) return null;
  return trigger.triggerTimestamp ?? null;
}

function collectEvidence(pipeline: PipelineResult): Evidence[] {
  return [
    ...pipeline.structure.evidence,
    ...pipeline.regime.evidence,
    ...pipeline.bias.evidence,
    ...pipeline.setup.evidence,
    ...(pipeline.trigger?.evidence ?? []),
    ...(pipeline.risk?.evidence ?? []),
    ...(pipeline.execution?.evidence ?? []),
  ];
}

function collectConflicts(pipeline: PipelineResult): Conflict[] {
  return [
    ...pipeline.structure.conflicts,
    ...pipeline.regime.conflicts,
    ...pipeline.bias.conflicts,
    ...pipeline.setup.conflicts,
    ...(pipeline.trigger?.conflicts ?? []),
    ...(pipeline.risk?.conflicts ?? []),
    ...(pipeline.execution?.conflicts ?? []),
  ];
}

function staleIssue(symbol: string, timeframe: Timeframe, ageMs: number) {
  return [
    {
      code: "STALE_DATA" as const,
      symbol,
      timeframe,
      message: `Newest closed candle is ${Math.round(ageMs / 1000)}s old at the analysis time.`,
    },
  ];
}

function summarizeFreshness(results: SymbolScanResult[]): Record<FreshnessStatus, number> {
  const summary: Record<FreshnessStatus, number> = { FRESH: 0, DELAYED: 0, STALE: 0 };
  for (const result of results) {
    if (result.freshness !== null) {
      summary[result.freshness] += 1;
    }
  }
  return summary;
}

function providerStatusOf(provider: MarketDataProvider): ProviderStatus {
  const status = provider.getProviderStatus();
  return {
    state: status.state,
    lastSuccessAt: status.lastSuccessAt,
    lastFailureAt: status.lastFailureAt,
    errorCount: status.errorCount,
    latencyMs: status.latencyMs,
  };
}

export type { ProviderStatus };
