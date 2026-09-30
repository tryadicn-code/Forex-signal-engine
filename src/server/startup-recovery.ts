import "server-only";

import { listPersistedBacktests } from "@/server/backtest-access";
import { BROKER_EXECUTION_CONFIG } from "@/config/broker";
import { readBrokerExecutionState } from "@/server/broker-execution-access";
import {
  readForwardValidationStoreState,
} from "@/server/forward-validation-access";
import { readPaperState } from "@/server/paper-trading-access";
import { readReleaseRuntimeAudit } from "@/server/release-runtime-access";
import { readStrategyVersionRegistry } from "@/server/strategy-version-access";
import type {
  StartupRecoveryCheck,
  StartupRecoveryReport,
} from "@/production/startup-recovery-types";

type StartupRecoveryGlobal = typeof globalThis & {
  __fseStartupRecovery?: Promise<StartupRecoveryReport>;
};

export function ensureStartupRecovery(): Promise<StartupRecoveryReport> {
  const runtime = globalThis as StartupRecoveryGlobal;
  if (!runtime.__fseStartupRecovery) {
    runtime.__fseStartupRecovery = runStartupRecovery();
  }
  return runtime.__fseStartupRecovery;
}

export function resetStartupRecoveryForTests(): void {
  (globalThis as StartupRecoveryGlobal).__fseStartupRecovery = undefined;
}

async function runStartupRecovery(): Promise<StartupRecoveryReport> {
  const checks = await Promise.all([
    runCheck("paper", true, async () => {
      await readPaperState();
    }),
    runCheck("strategyRegistry", true, async () => {
      await readStrategyVersionRegistry();
    }),
    runCheck("releaseRuntimeAudit", false, async () => {
      await readReleaseRuntimeAudit();
    }),
    runCheck("forwardValidation", true, async () => {
      await readForwardValidationStoreState();
    }),
    runCheck("backtestRuns", false, async () => {
      await listPersistedBacktests(20);
    }),
    runCheck(
      "brokerExecution",
      BROKER_EXECUTION_CONFIG.mode === "live",
      async () => {
        await readBrokerExecutionState();
      }
    ),
  ]);

  return {
    protocol: "phase-10-startup-recovery-v1",
    completedAt: Date.now(),
    blocking: checks.some((item) => item.critical && !item.ok),
    checks,
  };
}

async function runCheck(
  domain: StartupRecoveryCheck["domain"],
  critical: boolean,
  work: () => Promise<void>
): Promise<StartupRecoveryCheck> {
  try {
    await work();
    return {
      domain,
      critical,
      ok: true,
      message: "State is readable or was recovered successfully.",
    };
  } catch (error) {
    return {
      domain,
      critical,
      ok: false,
      message:
        error instanceof Error ? error.message : String(error),
    };
  }
}
