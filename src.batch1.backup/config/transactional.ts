export type TransactionalStoreMode = "local" | "remote";

export interface TransactionalConfig {
  mode: TransactionalStoreMode;
  requireSharedStore: boolean;
  remoteUrl: string | null;
  remoteToken: string | null;
  requestTimeoutMs: number;
  leaseTtlMs: number;
  instanceId: string | null;
}

export function resolveTransactionalConfig(
  env: Record<string, string | undefined> = process.env
): TransactionalConfig {
  const mode =
    env.FSE_TX_STORE_MODE?.trim().toLowerCase() === "remote"
      ? "remote"
      : "local";

  return {
    mode,
    requireSharedStore: parseBoolean(
      env.FSE_REQUIRE_SHARED_TX_STORE,
      false
    ),
    remoteUrl: normalizeOptional(env.FSE_TX_STORE_URL),
    remoteToken: normalizeOptional(env.FSE_TX_STORE_TOKEN),
    requestTimeoutMs: parsePositiveInteger(
      env.FSE_TX_STORE_TIMEOUT_MS,
      8_000
    ),
    leaseTtlMs: parsePositiveInteger(
      env.FSE_TX_LEASE_TTL_MS,
      180_000
    ),
    instanceId: normalizeOptional(env.FSE_INSTANCE_ID),
  };
}

export const TRANSACTIONAL_CONFIG = resolveTransactionalConfig();

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
  return fallback;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
