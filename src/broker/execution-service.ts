import { createHash } from "node:crypto";
import type { BrokerExecutionConfig } from "@/config/broker";
import type {
  BrokerExecutionDashboard,
  BrokerExecutionRecord,
  BrokerExecutionStoreState,
  BrokerOrderIntent,
  BrokerPosition,
  BrokerProvider,
  BrokerStatus,
  LiveExecutionArm,
} from "@/broker/types";
import type { BrokerExecutionStore } from "@/broker/execution-store";
import type { ReleaseRuntimeState } from "@/runtime/release-runtime-types";
import type {
  ScannerSnapshot,
  SymbolScanResult,
} from "@/scanner/scanner-result";

export interface BrokerExecutionLeaseGrant {
  fencingToken: number;
  release(): Promise<void>;
}

export interface BrokerExecutionLeaseCoordinator {
  acquire(): Promise<BrokerExecutionLeaseGrant | null>;
}

export interface BrokerExecutionServiceOptions {
  store: BrokerExecutionStore;
  provider: BrokerProvider;
  config: BrokerExecutionConfig;
  sharedTransactional: boolean;
  lease?: BrokerExecutionLeaseCoordinator;
}

export class BrokerExecutionService {
  constructor(private readonly options: BrokerExecutionServiceOptions) {}

  async dashboard(): Promise<BrokerExecutionDashboard> {
    await this.normalizeStaleLiveSubmitting();
    const state = await this.normalizeExpiredArm();
    const brokerStatus = await this.safeStatus();
    const openPositions = brokerStatus.connected
      ? await this.safePositions()
      : [];
    const blockers = this.dashboardLiveBlockers(
      state,
      brokerStatus,
      openPositions
    );

    return {
      protocol: "phase-10-broker-dashboard-v1",
      generatedAt: Date.now(),
      mode: this.options.config.mode.toUpperCase() as
        | "OFF"
        | "SHADOW"
        | "LIVE",
      providerId: this.options.provider.id,
      liveExecutionEnabled: this.options.config.liveExecutionEnabled,
      sharedStateRequiredForLive: true,
      controls: structuredClone(state.controls),
      brokerStatus,
      openPositions,
      recentRecords: [...state.records]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 100),
      unresolvedCount: state.records.filter(
        (record) =>
          record.status === "RECONCILIATION_REQUIRED"
      ).length,
      liveReady: blockers.length === 0,
      liveBlockers: blockers,
    };
  }

  async setKillSwitch(input: {
    engaged: boolean;
    changedBy: string;
    reason: string;
  }): Promise<BrokerExecutionStoreState> {
    const changedBy = normalizeActor(input.changedBy);
    const reason = normalizeReason(input.reason);
    if (!input.engaged) {
      if (!this.options.sharedTransactional) {
        throw new Error(
          "Kill-switch cannot be disengaged without shared transactional state."
        );
      }
      if (!this.options.config.liveExecutionEnabled) {
        throw new Error(
          "Live execution environment gate is disabled."
        );
      }
      if (this.options.config.emergencyStop) {
        throw new Error(
          "Environment emergency stop is engaged."
        );
      }
    }

    return this.options.store.update((state) => {
      const next = structuredClone(state);
      next.controls.killSwitchEngaged = input.engaged;
      next.controls.killSwitchChangedAt = Date.now();
      next.controls.killSwitchChangedBy = changedBy;
      next.controls.killSwitchReason = reason;
      if (input.engaged) next.controls.liveArm = null;
      return { next, result: structuredClone(next) };
    });
  }

  async armLive(input: {
    approvedBy: string;
    reason: string;
    durationMinutes?: number;
    maxOrders?: number;
  }): Promise<LiveExecutionArm> {
    if (this.options.config.mode !== "live") {
      throw new Error("FSE_BROKER_MODE must be live before arming.");
    }
    if (!this.options.config.liveExecutionEnabled) {
      throw new Error("FSE_LIVE_EXECUTION_ENABLED is false.");
    }
    if (this.options.config.emergencyStop) {
      throw new Error("FSE_LIVE_EMERGENCY_STOP is engaged.");
    }
    if (!this.options.sharedTransactional) {
      throw new Error(
        "Live execution requires shared transactional state."
      );
    }
    if (this.options.provider.id === "shadow") {
      throw new Error(
        "A real broker provider must be configured before arming."
      );
    }

    const approvedBy = normalizeActor(input.approvedBy);
    const reason = normalizeReason(input.reason);
    const durationMinutes = clampInteger(
      input.durationMinutes ?? this.options.config.armMaxMinutes,
      1,
      this.options.config.armMaxMinutes,
      "durationMinutes"
    );
    const maxOrders = clampInteger(
      input.maxOrders ?? this.options.config.armMaxOrders,
      1,
      this.options.config.armMaxOrders,
      "maxOrders"
    );
    const armedAt = Date.now();
    const arm: LiveExecutionArm = {
      approvedBy,
      reason,
      armedAt,
      expiresAt: armedAt + durationMinutes * 60_000,
      remainingOrders: maxOrders,
      armId: "arm-" + shortHash(
        approvedBy + ":" + armedAt + ":" + reason
      ),
    };

    await this.options.store.update((state) => {
      if (state.controls.killSwitchEngaged) {
        throw new Error(
          "Kill-switch must be disengaged before live execution can be armed."
        );
      }
      if (
        state.records.some(
          (record) =>
            record.status === "RECONCILIATION_REQUIRED"
        )
      ) {
        throw new Error(
          "Live execution cannot be armed while reconciliation is required."
        );
      }
      const next = structuredClone(state);
      next.controls.liveArm = arm;
      return { next, result: null };
    });
    return structuredClone(arm);
  }

  async disarmLive(input: {
    changedBy: string;
    reason: string;
  }): Promise<void> {
    normalizeActor(input.changedBy);
    normalizeReason(input.reason);
    await this.options.store.update((state) => {
      const next = structuredClone(state);
      next.controls.liveArm = null;
      return { next, result: null };
    });
  }

  async processSnapshot(
    snapshot: ScannerSnapshot,
    release: ReleaseRuntimeState
  ): Promise<void> {
    if (this.options.config.mode === "off") return;
    await this.normalizeStaleLiveSubmitting();
    await this.purgeExpiredRejections(this.options.config.rejectionTtlMs);

    const candidates = snapshot.results
      .filter(isExecutableCandidate)
      .slice(0, this.options.config.maxOrdersPerCycle);
    if (candidates.length === 0) return;

    if (this.options.config.mode === "shadow") {
      for (const candidate of candidates) {
        await this.processShadow(candidate, release);
      }
      return;
    }

    const status = await this.safeStatus();
    const positions = status.connected
      ? await this.safePositions()
      : [];

    for (const candidate of candidates) {
      await this.processLiveCandidate(
        candidate,
        release,
        status,
        positions
      );
    }
  }

  async reconcileUnresolved(): Promise<number> {
    const state = await this.options.store.read();
    const unresolved = state.records.filter(
      (record) =>
        record.status === "RECONCILIATION_REQUIRED"
    );
    let reconciled = 0;

    for (const record of unresolved) {
      try {
        const result = await this.options.provider.reconcile(
          record.clientTag
        );
        await this.options.store.update((current) => {
          const next = structuredClone(current);
          const target = next.records.find(
            (item) => item.id === record.id
          );
          if (!target) return { next, result: null };

          target.reconciliation = result;
          target.updatedAt = Date.now();
          if (result.found) {
            target.status = "RECONCILED";
            target.message = result.message;
          } else {
            target.message =
              "Reconciliation did not find broker state; manual review is still required.";
          }
          return { next, result: null };
        });
        if (result.found) reconciled += 1;
      } catch {
        // Keep the record unresolved. Reconciliation can be retried safely
        // because it is read-only at the broker.
      }
    }
    return reconciled;
  }

  private async processShadow(
    result: SymbolScanResult,
    release: ReleaseRuntimeState
  ): Promise<void> {
    const intent = buildIntent(result, release, this.options.config);
    if (!intent) return;

    const existing = await this.findByKey(intent.idempotencyKey);
    if (existing) return;

    const preflight = await this.options.provider.preflight(intent);
    const now = Date.now();
    const record: BrokerExecutionRecord = {
      id: "broker-" + shortHash(intent.idempotencyKey),
      idempotencyKey: intent.idempotencyKey,
      signalId: intent.signalId,
      strategyId: intent.strategyId,
      clientTag: intent.clientTag,
      symbol: intent.symbol,
      side: intent.side,
      volume: intent.volume,
      riskPercent: intent.riskPercent,
      mode: "SHADOW",
      status: preflight.ok
        ? "SHADOW_ACCEPTED"
        : "SHADOW_REJECTED",
      createdAt: now,
      updatedAt: now,
      strategyVersion: intent.strategyVersion,
      strategyManifestFingerprint:
        intent.strategyManifestFingerprint,
      strategyActivationAt: intent.strategyActivationAt,
      preflight,
      brokerResult: null,
      reconciliation: null,
      message: preflight.message,
    };

    await this.options.store.update((state) => {
      if (
        state.records.some(
          (item) => item.idempotencyKey === intent.idempotencyKey
        )
      ) {
        return { next: state, result: null };
      }
      const next = structuredClone(state);
      next.records = [...next.records, record].slice(-500);
      return { next, result: null };
    });
  }

  private async processLiveCandidate(
    result: SymbolScanResult,
    release: ReleaseRuntimeState,
    brokerStatus: BrokerStatus,
    positions: BrokerPosition[]
  ): Promise<void> {
    const intent = buildIntent(result, release, this.options.config);
    if (!intent) return;
    if (await this.findByKey(intent.idempotencyKey)) return;

    const brokerState = await this.options.store.read();
    if (
      brokerState.records.some(
        (record) =>
          record.status === "RECONCILIATION_REQUIRED"
      )
    ) {
      await this.recordLiveRejection(
        intent,
        "A previous live submission requires reconciliation; new live orders are blocked."
      );
      return;
    }

    const blockers = this.intentLiveBlockers(
      intent,
      release,
      brokerStatus,
      positions
    );
    if (blockers.length > 0) {
      await this.recordLiveRejection(intent, blockers.join("; "));
      return;
    }

    const lease = await this.options.lease?.acquire();
    if (!lease) {
      await this.recordLiveRejection(
        intent,
        "Unable to acquire exclusive live-execution lease."
      );
      return;
    }

    try {
      // Re-read broker state after obtaining the external-side-effect lease.
      // This narrows the race window between exposure checks and submission.
      const freshStatus = await this.safeStatus();
      const freshPositions = freshStatus.connected
        ? await this.safePositions()
        : [];
      const freshBlockers = this.intentLiveBlockers(
        intent,
        release,
        freshStatus,
        freshPositions
      );
      if (freshBlockers.length > 0) {
        await this.recordLiveRejection(
          intent,
          freshBlockers.join("; "),
          lease.fencingToken
        );
        return;
      }

      const reserved = await this.reserveLiveAttempt(intent, lease.fencingToken);
      if (!reserved) return;

      let preflight;
      try {
        preflight = await this.options.provider.preflight(intent);
      } catch (error) {
        await this.markRecord(
          intent.idempotencyKey,
          "LIVE_PREFLIGHT_REJECTED",
          "Broker preflight failed safely before submission: " +
            errorMessage(error),
          null,
          null,
          lease.fencingToken
        );
        await this.refundLiveAttempt();
        return;
      }

      if (!preflight.ok) {
        await this.markRecord(
          intent.idempotencyKey,
          "LIVE_PREFLIGHT_REJECTED",
          preflight.message,
          preflight,
          null,
          lease.fencingToken
        );
        await this.refundLiveAttempt();
        return;
      }

      if (
        preflight.normalizedVolume == null ||
        Math.abs(preflight.normalizedVolume - intent.volume) > 1e-9
      ) {
        await this.markRecord(
          intent.idempotencyKey,
          "LIVE_PREFLIGHT_REJECTED",
          "Broker volume normalization differs from the frozen execution intent.",
          preflight,
          null,
          lease.fencingToken
        );
        await this.refundLiveAttempt();
        return;
      }

      await this.markRecord(
        intent.idempotencyKey,
        "LIVE_SUBMITTING",
        "Broker preflight passed; one live submission is in progress.",
        preflight,
        null,
        lease.fencingToken
      );

      try {
        const brokerResult =
          await this.options.provider.placeOrder(intent);
        const recordStatus: BrokerExecutionRecord["status"] =
          brokerResult.accepted
            ? "LIVE_ACCEPTED"
            : brokerResult.outcome === "UNKNOWN"
              ? "RECONCILIATION_REQUIRED"
              : "LIVE_REJECTED";
        const recordMessage =
          brokerResult.outcome === "UNKNOWN"
            ? "Broker returned an uncertain transmission outcome. Automatic retry is forbidden: " +
              brokerResult.message
            : brokerResult.message;
        await this.markRecord(
          intent.idempotencyKey,
          recordStatus,
          recordMessage,
          preflight,
          brokerResult,
          lease.fencingToken
        );
      } catch (error) {
        await this.markRecord(
          intent.idempotencyKey,
          "RECONCILIATION_REQUIRED",
          "Live submit returned an uncertain transport result. Automatic retry is forbidden: " +
            errorMessage(error),
          preflight,
          null
        );
      }
    } finally {
      await lease.release();
    }
  }

  private async reserveLiveAttempt(
    intent: BrokerOrderIntent,
    fencingToken?: number
  ): Promise<boolean> {
    return this.options.store.update((state) => {
      if (
        state.records.some(
          (record) =>
            record.idempotencyKey === intent.idempotencyKey
        )
      ) {
        return { next: state, result: false };
      }
      if (
        state.records.some(
          (record) =>
            record.status === "RECONCILIATION_REQUIRED"
        )
      ) {
        return { next: state, result: false };
      }

      const now = Date.now();
      const arm = state.controls.liveArm;
      if (
        state.controls.killSwitchEngaged ||
        !arm ||
        arm.expiresAt <= now ||
        arm.remainingOrders <= 0
      ) {
        return { next: state, result: false };
      }

      const next = structuredClone(state);
      if (!next.controls.liveArm) {
        return { next: state, result: false };
      }
      next.controls.liveArm.remainingOrders -= 1;

      const record: BrokerExecutionRecord = {
        id: "broker-" + shortHash(intent.idempotencyKey),
        idempotencyKey: intent.idempotencyKey,
        signalId: intent.signalId,
        strategyId: intent.strategyId,
        clientTag: intent.clientTag,
        symbol: intent.symbol,
        side: intent.side,
        volume: intent.volume,
        riskPercent: intent.riskPercent,
        mode: "LIVE",
        status: "LIVE_SUBMITTING",
        createdAt: now,
        updatedAt: now,
        strategyVersion: intent.strategyVersion,
        strategyManifestFingerprint:
          intent.strategyManifestFingerprint,
        strategyActivationAt: intent.strategyActivationAt,
        preflight: null,
        brokerResult: null,
        reconciliation: null,
        message:
          "Live order slot reserved atomically before broker preflight.",
      };
      next.records = [...next.records, record].slice(-500);
      return { next, result: true };
    }, fencingToken);
  }

  private async recordLiveRejection(
    intent: BrokerOrderIntent,
    message: string,
    fencingToken?: number
  ): Promise<void> {
    const now = Date.now();
    await this.options.store.update((state) => {
      if (
        state.records.some(
          (record) =>
            record.idempotencyKey === intent.idempotencyKey
        )
      ) {
        return { next: state, result: null };
      }
      const next = structuredClone(state);
      next.records = [
        ...next.records,
        {
          id: "broker-" + shortHash(intent.idempotencyKey),
          idempotencyKey: intent.idempotencyKey,
          signalId: intent.signalId,
          strategyId: intent.strategyId,
          clientTag: intent.clientTag,
          symbol: intent.symbol,
          side: intent.side,
          volume: intent.volume,
          riskPercent: intent.riskPercent,
          mode: "LIVE" as const,
          status: "LIVE_PREFLIGHT_REJECTED" as const,
          createdAt: now,
          updatedAt: now,
          strategyVersion: intent.strategyVersion,
          strategyManifestFingerprint:
            intent.strategyManifestFingerprint,
          strategyActivationAt: intent.strategyActivationAt,
          preflight: null,
          brokerResult: null,
          reconciliation: null,
          message,
        },
      ].slice(-500);
      return { next, result: null };
    }, fencingToken);
  }

  private async markRecord(
    key: string,
    status: BrokerExecutionRecord["status"],
    message: string,
    preflight: BrokerExecutionRecord["preflight"],
    brokerResult: BrokerExecutionRecord["brokerResult"],
    fencingToken?: number
  ): Promise<void> {
    await this.options.store.update((state) => {
      const next = structuredClone(state);
      const record = next.records.find(
        (item) => item.idempotencyKey === key
      );
      if (!record) {
        throw new Error(
          "Broker execution record disappeared before status update."
        );
      }
      record.status = status;
      record.message = message;
      record.updatedAt = Date.now();
      if (preflight) record.preflight = preflight;
      if (brokerResult) record.brokerResult = brokerResult;
      return { next, result: null };
    }, fencingToken);
  }

  private async findByKey(
    key: string
  ): Promise<BrokerExecutionRecord | null> {
    const state = await this.options.store.read();
    return (
      state.records.find(
        (record) => record.idempotencyKey === key
      ) ?? null
    );
  }

  private dashboardLiveBlockers(
    state: BrokerExecutionStoreState,
    brokerStatus: BrokerStatus,
    positions: BrokerPosition[]
  ): string[] {
    const blockers: string[] = [];
    if (this.options.config.mode !== "live") {
      blockers.push("Broker mode is not LIVE.");
    }
    if (!this.options.config.liveExecutionEnabled) {
      blockers.push("Live execution environment gate is disabled.");
    }
    if (!this.options.config.approvalSecret) {
      blockers.push("Live approval secret is not configured.");
    }
    if (this.options.config.allowedSymbols.length === 0) {
      blockers.push("Live symbol allowlist is empty.");
    }
    if (this.options.config.emergencyStop) {
      blockers.push("Environment emergency stop is engaged.");
    }
    if (!this.options.sharedTransactional) {
      blockers.push("Shared transactional state is required.");
    }
    if (this.options.provider.id === "shadow") {
      blockers.push("No real broker provider is configured.");
    }
    if (state.controls.killSwitchEngaged) {
      blockers.push("Kill-switch is engaged.");
    }
    if (
      state.records.some(
        (record) =>
          record.status === "RECONCILIATION_REQUIRED"
      )
    ) {
      blockers.push(
        "A previous live submission requires reconciliation."
      );
    }
    const arm = state.controls.liveArm;
    if (!arm) {
      blockers.push("No live arm approval exists.");
    } else {
      if (arm.expiresAt <= Date.now()) {
        blockers.push("Live arm approval has expired.");
      }
      if (arm.remainingOrders <= 0) {
        blockers.push("Live arm order quota is exhausted.");
      }
    }
    blockers.push(
      ...brokerStatusBlockers(
        brokerStatus,
        positions,
        this.options.config.maxOpenPositions,
        this.options.config.maxEquityDrawdownPercent
      )
    );
    return blockers;
  }

  private intentLiveBlockers(
    intent: BrokerOrderIntent,
    release: ReleaseRuntimeState,
    brokerStatus: BrokerStatus,
    positions: BrokerPosition[]
  ): string[] {
    const blockers = this.dashboardLiveBlockers(
      {
        schemaVersion: 1,
        protocol: "phase-10-broker-v1",
        controls: {
          killSwitchEngaged: false,
          killSwitchChangedAt: 0,
          killSwitchChangedBy: "",
          killSwitchReason: "",
          liveArm: {
            approvedBy: "",
            reason: "",
            armedAt: 0,
            expiresAt: Date.now() + 1,
            remainingOrders: 1,
            armId: "",
          },
        },
        records: [],
      },
      brokerStatus,
      positions
    ).filter(
      (message) =>
        message !== "Kill-switch is engaged." &&
        message !== "No live arm approval exists." &&
        message !== "Live arm approval has expired." &&
        message !== "Live arm order quota is exhausted."
    );

    if (
      release.status !== "ACTIVE" ||
      !release.pinned ||
      release.defaultDrift ||
      !release.version ||
      !release.manifestFingerprint ||
      release.activationAt === null
    ) {
      blockers.push(
        "Live execution requires a pinned ACTIVE release with no default drift."
      );
    }
    if (
      !brokerStatus.accountCurrency ||
      brokerStatus.accountCurrency.toUpperCase() !==
        intent.accountCurrency.toUpperCase()
    ) {
      blockers.push(
        "Broker account currency does not match the risk-engine account currency."
      );
    }
    if (
      this.options.config.allowedSymbols.length === 0 ||
      !this.options.config.allowedSymbols.includes(intent.symbol)
    ) {
      blockers.push(
        "Symbol is not present in the explicit live allowlist."
      );
    }
    if (intent.riskPercent > this.options.config.maxRiskPercent) {
      blockers.push("Risk percent exceeds the live hard limit.");
    }
    if (intent.volume > this.options.config.maxLot) {
      blockers.push("Position size exceeds the live lot hard limit.");
    }
    if (
      this.options.config.blockSameSymbolPosition &&
      positions.some((position) => position.symbol === intent.symbol)
    ) {
      blockers.push(
        "An open broker position already exists for this symbol."
      );
    }
    // B2-M6: require a take profit level for live execution unless explicitly
    // disabled. A live position without a TP can hang indefinitely.
    if (
      this.options.config.requireTakeProfitForLive &&
      intent.takeProfit === null
    ) {
      blockers.push(
        "Live execution requires a take profit level (FSE_LIVE_REQUIRE_TAKE_PROFIT)."
      );
    }

    return blockers;
  }

  /**
   * M1: refund one live-order slot when a preflight failure prevented the
   * order from ever reaching the broker. Called on every pre-submit abort
   * path. Safe no-op if the arm has already expired or been disarmed.
   */
  private async refundLiveAttempt(): Promise<void> {
    await this.options.store.update((state) => {
      const next = structuredClone(state);
      const arm = next.controls.liveArm;
      if (arm && arm.expiresAt > Date.now()) {
        arm.remainingOrders += 1;
      }
      return { next, result: null };
    });
  }

  /**
   * M2: purge preflight rejections older than the TTL so a transient blocker
   * does not permanently starve a signal. Only LIVE_PREFLIGHT_REJECTED
   * records are eligible: those provably never reached the broker.
   */
  private async purgeExpiredRejections(
    ttlMs: number
  ): Promise<void> {
    const now = Date.now();
    await this.options.store.update((state) => {
      const before = state.records.length;
      const filtered = state.records.filter(
        (r) =>
          !(
            r.status === "LIVE_PREFLIGHT_REJECTED" &&
            now - r.createdAt > ttlMs
          )
      );
      if (filtered.length === before) {
        return { next: state, result: null };
      }
      const next = structuredClone(state);
      next.records = filtered;
      return { next, result: null };
    });
  }

  /**
   * B2-H1: auto-escalate stale LIVE_SUBMITTING records.
   *
   * A process kill between reserveLiveAttempt and markRecord leaves a record
   * stuck at LIVE_SUBMITTING. Without this, the broker may have received the
   * order while FSE never reconciles. Escalating to RECONCILIATION_REQUIRED
   * blocks new live orders and forces operator review.
   */
  private async normalizeStaleLiveSubmitting(
    maxAgeMs: number = 10 * 60_000
  ): Promise<void> {
    const now = Date.now();
    await this.options.store.update((state) => {
      const stale = state.records.filter(
        (record) =>
          record.status === "LIVE_SUBMITTING" &&
          now - record.updatedAt > maxAgeMs
      );
      if (stale.length === 0) return { next: state, result: null };
      const next = structuredClone(state);
      for (const s of stale) {
        const target = next.records.find((r) => r.id === s.id);
        if (target) {
          target.status = "RECONCILIATION_REQUIRED";
          target.message =
            "Stale LIVE_SUBMITTING record auto-escalated after " +
            Math.round(maxAgeMs / 1000) +
            "s without update.";
          target.updatedAt = now;
        }
      }
      return { next, result: null };
    });
  }

  private async normalizeExpiredArm(): Promise<BrokerExecutionStoreState> {
    const current = await this.options.store.read();
    if (
      !current.controls.liveArm ||
      current.controls.liveArm.expiresAt > Date.now()
    ) {
      return structuredClone(current);
    }

    return this.options.store.update((state) => {
      if (
        !state.controls.liveArm ||
        state.controls.liveArm.expiresAt > Date.now()
      ) {
        return { next: state, result: structuredClone(state) };
      }
      const next = structuredClone(state);
      next.controls.liveArm = null;
      return { next, result: structuredClone(next) };
    });
  }

  private async safeStatus(): Promise<BrokerStatus> {
    try {
      return await this.options.provider.status();
    } catch (error) {
      return {
        providerId: this.options.provider.id,
        connected: false,
        tradeAllowed: false,
        expertTradingAllowed: null,
        terminalTradingAllowed: null,
        accountCurrency: null,
        balance: null,
        equity: null,
        message: "Broker status unavailable: " + errorMessage(error),
      };
    }
  }

  private async safePositions(): Promise<BrokerPosition[]> {
    // Position visibility is part of the live exposure gate. If broker
    // positions cannot be read, fail closed rather than assuming zero exposure.
    return this.options.provider.listOpenPositions();
  }
}

function isExecutableCandidate(result: SymbolScanResult): boolean {
  return (
    result.status === "ANALYSED" &&
    result.executionDecision === "EXECUTE" &&
    result.signalState === "EXECUTE" &&
    result.freshness === "FRESH" &&
    typeof result.signalId === "string" &&
    typeof result.strategyId === "string" &&
    (result.biasDirection === "LONG" ||
      result.biasDirection === "SHORT") &&
    result.riskDetail?.approved === true
  );
}

function buildIntent(
  result: SymbolScanResult,
  release: ReleaseRuntimeState,
  config: BrokerExecutionConfig
): BrokerOrderIntent | null {
  if (
    !result.signalId ||
    !result.strategyId ||
    (result.biasDirection !== "LONG" &&
      result.biasDirection !== "SHORT") ||
    release.status !== "ACTIVE" ||
    !release.version ||
    !release.manifestFingerprint ||
    release.activationAt === null
  ) {
    return null;
  }

  const risk = result.riskDetail;
  const entry = risk?.entryPrice;
  const stop = risk?.stopLoss;
  const volume = risk?.positionSize;
  const riskPercent = risk?.riskPercent;
  if (
    !risk?.approved ||
    entry == null ||
    stop == null ||
    volume == null ||
    riskPercent == null ||
    !Number.isFinite(entry) ||
    !Number.isFinite(stop) ||
    !Number.isFinite(volume) ||
    !Number.isFinite(riskPercent) ||
    entry <= 0 ||
    stop <= 0 ||
    volume <= 0 ||
    riskPercent <= 0
  ) {
    return null;
  }

  const idempotencyKey = [
    "broker",
    release.version,
    release.activationAt,
    result.signalId,
  ].join(":");

  return {
    id: "intent-" + shortHash(idempotencyKey),
    strategyId: result.strategyId,
    idempotencyKey,
    clientTag: "FSE-" + shortHash(idempotencyKey).slice(0, 20),
    signalId: result.signalId,
    symbol: result.symbol,
    side: result.biasDirection === "LONG" ? "BUY" : "SELL",
    volume,
    expectedEntry: entry,
    stopLoss: stop,
    takeProfit: risk.takeProfit1 ?? null,
    riskPercent,
    accountCurrency: risk.accountCurrency ?? "",
    maxDeviationPoints: config.mt5MaxDeviationPoints,
    requestedAt: Date.now(),
    strategyVersion: release.version,
    strategyManifestFingerprint: release.manifestFingerprint,
    strategyActivationAt: release.activationAt,
  };
}

function brokerStatusBlockers(
  status: BrokerStatus,
  positions: BrokerPosition[],
  maxOpenPositions: number,
  maxEquityDrawdownPercent: number
): string[] {
  const blockers: string[] = [];
  if (!status.connected) blockers.push("Broker is disconnected.");
  if (!status.tradeAllowed) blockers.push("Broker account does not allow trading.");
  if (status.expertTradingAllowed === false) {
    blockers.push("Broker terminal has expert/algo trading disabled.");
  }
  if (status.terminalTradingAllowed === false) {
    blockers.push("Broker terminal trading is disabled.");
  }
  if (positions.length >= maxOpenPositions) {
    blockers.push("Maximum broker open-position limit reached.");
  }
  if (
    status.balance !== null &&
    status.equity !== null &&
    status.balance > 0
  ) {
    const drawdown =
      ((status.balance - status.equity) / status.balance) * 100;
    if (drawdown >= maxEquityDrawdownPercent) {
      blockers.push("Broker equity drawdown hard limit reached.");
    }
  }
  return blockers;
}

function normalizeActor(value: string): string {
  const actor = value.trim();
  if (!actor) throw new Error("Operator identity is required.");
  if (actor.length > 80) {
    throw new Error("Operator identity must be 80 characters or fewer.");
  }
  return actor;
}

function normalizeReason(value: string): string {
  const reason = value.trim();
  if (!reason) throw new Error("A reason is required.");
  if (reason.length > 1000) {
    throw new Error("Reason must be 1000 characters or fewer.");
  }
  return reason;
}

/**
 * H5-2: reject out-of-range integers instead of silently clamping.
 *
 * Silent clamping is dangerous for arm limits: an operator requesting a
 * 60-minute window but silently getting 10 minutes may believe they have
 * authority they do not actually have.
 */
function clampInteger(
  value: number,
  min: number,
  max: number,
  label: string
): number {
  if (!Number.isInteger(value)) {
    throw new Error(label + " must be an integer, got " + value + ".");
  }
  if (value < min) {
    throw new Error(label + " " + value + " is below the minimum " + min + ".");
  }
  if (value > max) {
    throw new Error(label + " " + value + " exceeds the maximum " + max + ".");
  }
  return value;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
