export interface StartupRecoveryCheck {
  domain:
    | "paper"
    | "strategyRegistry"
    | "releaseRuntimeAudit"
    | "forwardValidation"
    | "backtestRuns"
    | "brokerExecution"
    | "notifications";
  critical: boolean;
  ok: boolean;
  message: string;
}

export interface StartupRecoveryReport {
  protocol: "phase-11-startup-recovery-v1";
  completedAt: number;
  blocking: boolean;
  checks: StartupRecoveryCheck[];
}
