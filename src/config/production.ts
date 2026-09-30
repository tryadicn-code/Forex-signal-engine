export interface ProductionConfig {
  maintenanceMode: boolean;
  requireActiveRelease: boolean;
  requireLiveMarketData: boolean;
}

export function resolveProductionConfig(
  env: Record<string, string | undefined> = process.env
): ProductionConfig {
  return {
    maintenanceMode: parseBoolean(env.FSE_MAINTENANCE_MODE, false),
    requireActiveRelease: parseBoolean(
      env.FSE_REQUIRE_ACTIVE_RELEASE,
      false
    ),
    requireLiveMarketData: parseBoolean(
      env.FSE_REQUIRE_LIVE_MARKET_DATA,
      false
    ),
  };
}

export const PRODUCTION_CONFIG = resolveProductionConfig();

function parseBoolean(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value == null || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}
