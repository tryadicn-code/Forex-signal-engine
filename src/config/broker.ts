export type BrokerExecutionMode = "off" | "shadow" | "live";
export type BrokerProviderId = "shadow" | "mt5";

export interface BrokerExecutionConfig {
  mode: BrokerExecutionMode;
  providerId: BrokerProviderId;
  liveExecutionEnabled: boolean;
  emergencyStop: boolean;
  approvalSecret: string | null;
  allowedSymbols: string[];
  maxRiskPercent: number;
  maxLot: number;
  maxOrdersPerCycle: number;
  maxOpenPositions: number;
  maxEquityDrawdownPercent: number;
  blockSameSymbolPosition: boolean;
  armMaxMinutes: number;
  armMaxOrders: number;
  requireTakeProfitForLive: boolean;
  /** M2: preflight rejections expire after this many ms, allowing retry. */
  rejectionTtlMs: number;
  liveLeaseMs: number;
  mt5BridgeUrl: string;
  mt5BridgeToken: string | null;
  mt5RequestTimeoutMs: number;
  mt5MaxDeviationPoints: number;
}

export function resolveBrokerExecutionConfig(
  env: Record<string, string | undefined> = process.env
): BrokerExecutionConfig {
  const mode = parseMode(env.FSE_BROKER_MODE);
  const providerId =
    env.FSE_BROKER_PROVIDER?.trim().toLowerCase() === "mt5"
      ? "mt5"
      : "shadow";

  return {
    mode,
    providerId,
    liveExecutionEnabled: parseBoolean(
      env.FSE_LIVE_EXECUTION_ENABLED,
      false
    ),
    emergencyStop: parseBoolean(
      env.FSE_LIVE_EMERGENCY_STOP,
      true
    ),
    approvalSecret: normalizeOptional(env.FSE_LIVE_APPROVAL_SECRET),
    allowedSymbols: parseSymbols(env.FSE_LIVE_ALLOWED_SYMBOLS),
    maxRiskPercent: parsePositiveNumber(
      env.FSE_LIVE_MAX_RISK_PERCENT,
      0.25
    ),
    maxLot: parsePositiveNumber(env.FSE_LIVE_MAX_LOT, 0.1),
    maxOrdersPerCycle: parsePositiveInteger(
      env.FSE_LIVE_MAX_ORDERS_PER_CYCLE,
      1
    ),
    maxOpenPositions: parsePositiveInteger(
      env.FSE_LIVE_MAX_OPEN_POSITIONS,
      1
    ),
    maxEquityDrawdownPercent: parsePositiveNumber(
      env.FSE_LIVE_MAX_EQUITY_DRAWDOWN_PERCENT,
      2
    ),
    blockSameSymbolPosition: parseBoolean(
      env.FSE_LIVE_BLOCK_SAME_SYMBOL_POSITION,
      true
    ),
    armMaxMinutes: parsePositiveInteger(
      env.FSE_LIVE_ARM_MAX_MINUTES,
      10
    ),
    armMaxOrders: parsePositiveInteger(
      env.FSE_LIVE_ARM_MAX_ORDERS,
      1
    ),
    requireTakeProfitForLive: parseBoolean(
      env.FSE_LIVE_REQUIRE_TAKE_PROFIT,
      true
    ),
    rejectionTtlMs: parsePositiveInteger(
      env.FSE_LIVE_REJECTION_TTL_MS,
      300_000
    ),
    liveLeaseMs: parsePositiveInteger(
      env.FSE_LIVE_EXECUTION_LEASE_MS,
      30_000
    ),
    mt5BridgeUrl:
      normalizeOptional(env.MT5_BRIDGE_URL) ??
      "http://127.0.0.1:8765",
    mt5BridgeToken: normalizeOptional(env.MT5_TRADE_BRIDGE_TOKEN),
    mt5RequestTimeoutMs: parsePositiveInteger(
      env.MT5_TRADE_REQUEST_TIMEOUT_MS,
      8_000
    ),
    mt5MaxDeviationPoints: parsePositiveInteger(
      env.MT5_TRADE_MAX_DEVIATION_POINTS,
      20
    ),
  };
}

export const BROKER_EXECUTION_CONFIG =
  resolveBrokerExecutionConfig();

function parseMode(value: string | undefined): BrokerExecutionMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "shadow" || normalized === "live") {
    return normalized;
  }
  return "off";
}

function parseSymbols(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean env value: "${value}"`);
}

function parsePositiveNumber(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive number env value: "${value}"`);
  }
  return parsed;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  const parsed = parsePositiveNumber(value, fallback);
  return Number.isInteger(parsed) ? parsed : fallback;
}
