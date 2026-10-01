import path from "node:path";

export interface StoragePaths {
  dataDirectory: string;
  paper: string;
  strategyRegistry: string;
  releaseRuntimeAudit: string;
  forwardValidation: string;
  backtestRuns: string;
  snapshots: string;
  brokerExecution: string;
  notifications: string;
  scannerUniverse: string;
}

export function resolveStoragePaths(
  env: Record<string, string | undefined> = process.env
): StoragePaths {
  const configured = env.FSE_DATA_DIR?.trim();
  const dataDirectory = configured
    ? path.resolve(configured)
    : path.join(process.cwd(), ".data");

  return {
    dataDirectory,
    paper:
      env.FSE_PAPER_STORE_PATH?.trim() ||
      path.join(dataDirectory, "paper-trading.json"),
    strategyRegistry: path.join(
      dataDirectory,
      "strategy-version-registry.json"
    ),
    releaseRuntimeAudit: path.join(
      dataDirectory,
      "release-runtime-audit.json"
    ),
    forwardValidation:
      env.FSE_FORWARD_VALIDATION_STORE_PATH?.trim() ||
      path.join(dataDirectory, "forward-validation.json"),
    backtestRuns: path.join(dataDirectory, "backtest-runs"),
    snapshots: path.join(dataDirectory, "snapshots"),
    brokerExecution: path.join(dataDirectory, "broker-execution.json"),
    notifications: path.join(dataDirectory, "notifications.json"),
    scannerUniverse: path.join(dataDirectory, "scanner-universe.json"),
  };
}

export const STORAGE_PATHS = resolveStoragePaths();
