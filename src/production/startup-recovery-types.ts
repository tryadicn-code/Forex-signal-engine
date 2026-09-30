export interface StartupRecoveryCheck {
  domain:
    | "paper"
    | "strategyRegistry"
    | "releaseRuntimeAudit"
    | "forwardValidation"
    | "backtestRuns"
    | "brokerExecution";
  critical: boolean;
  ok: boolean;
  message: string;
}

export interface StartupRecoveryReport {
  protocol: "phase-10-startup-recovery-v1";
  completedAt: number;
  blocking: boolean;
  checks: StartupRecoveryCheck[];
}
