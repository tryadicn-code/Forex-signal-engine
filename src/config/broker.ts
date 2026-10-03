import { SYMBOL_METADATA } from "@/config/scanner";

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

/**
 * H6-1: safe defaults returned when the environment is invalid.
 *
 * resolveBrokerExecutionConfig throws on any invalid value. That is correct
 * for a CLI, but it is dangerous as an eager module-level side effect: a
 * single typo in .env.local would crash the process before the scanner,
 * alerts, or replay could even start.
 *
 * We now catch the throw once at module load, log a loud message, and fall
 * back to a maximally safe configuration (mode=off, live disabled, emergency
 * stop engaged). The original error is preserved on BROKER_CONFIG_LOAD_ERROR
 * so the dashboard can display it.
 */
function safeBrokerDefaults(): BrokerExecutionConfig {
  return {
    mode: "off",
    providerId: "shadow",
    liveExecutionEnabled: false,
    emergencyStop: true,
    approvalSecret: null,
    allowedSymbols: [],
    maxRiskPercent: 0.25,
    maxLot: 0.1,
    maxOrdersPerCycle: 1,
    maxOpenPositions: 1,
    maxEquityDrawdownPercent: 2,
    blockSameSymbolPosition: true,
    armMaxMinutes: 10,
    armMaxOrders: 1,
    requireTakeProfitForLive: true,
    rejectionTtlMs: 300_000,
    liveLeaseMs: 30_000,
    mt5BridgeUrl: "http://127.0.0.1:8765",
    mt5BridgeToken: null,
    mt5RequestTimeoutMs: 8_000,
    mt5MaxDeviationPoints: 20,
  };
}

let _brokerConfigLoadError: string | null = null;

export function getBrokerConfigLoadError(): string | null {
  return _brokerConfigLoadError;
}

function loadBrokerConfigSafely(): BrokerExecutionConfig {
  try {
    return resolveBrokerExecutionConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    _brokerConfigLoadError = message;
    console.error(
      "[broker-config] Invalid broker environment detected. " +
        "Falling back to safe defaults (mode=off, liveExecutionEnabled=false, " +
        "emergencyStop=true). Fix the environment before arming live execution. " +
        "Reason: " +
        message
    );
    return safeBrokerDefaults();
  }
}

export const BROKER_EXECUTION_CONFIG = loadBrokerConfigSafely();

function parseMode(value: string | undefined): BrokerExecutionMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "shadow" || normalized === "live") {
    return normalized;
  }
  return "off";
}

function parseSymbols(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const symbols = [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];

  // M6-3: warn when the allowlist references symbols the scanner will never
  // produce. Such symbols will always block on the runtime resolver, but the
  // dashboard would otherwise present a plausible-looking allowlist.
  const unknown = symbols.filter((s) => !(s in SYMBOL_METADATA));
  if (unknown.length > 0) {
    console.warn(
      "[broker-config] FSE_LIVE_ALLOWED_SYMBOLS contains symbols outside the " +
        "supported universe: " +
        unknown.join(", ") +
        ". They will never match a scanned signal."
    );
  }
  return symbols;
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
  // H6-2: reject non-integer input explicitly instead of silently returning
  // the fallback. Previously FSE_LIVE_MAX_ORDERS_PER_CYCLE=1.5 would silently
  // become 1, giving the operator less authority than they requested without
  // any signal.
  const parsed = parsePositiveNumber(value, fallback);
  if (!Number.isInteger(parsed)) {
    throw new Error(
      'Invalid integer env value: "' +
        value +
        '" (expected a whole number, got ' +
        parsed +
        ")."
    );
  }
  return parsed;
}
