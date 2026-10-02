/**
 * Defensive copying for scanner configuration.
 *
 * {@link DEFAULT_SCANNER_CONFIG} is a module-level constant shared by every
 * caller. Handing it out directly would let any caller mutate the global
 * defaults through the object it received (an array `push` on `symbols`, or a
 * field write on `account`, would leak into every other consumer). This helper
 * produces an independent copy at every level that is actually mutable, so a
 * caller can freely mutate the config it receives without side effects on the
 * shared baseline or on other symbols.
 */

import type { ScannerConfig } from "@/config/scanner";

/**
 * Return an independent copy of a scanner config.
 *
 * Nested config objects (timeframe roles, TTL, freshness thresholds, account)
 * are copied by key so a caller cannot reach the shared nested objects. Arrays
 * are copied by reference into a new array, which is sufficient because the
 * config arrays are treated as read-only replacements rather than mutated
 * in place.
 */
export function cloneScannerConfig(config: ScannerConfig): ScannerConfig {
  return {
    ...config,
    symbols: [...config.symbols],
    timeframeRoles: { ...config.timeframeRoles },
    signalTtl: { ...config.signalTtl },
    freshness: { ...config.freshness },
    account: { ...config.account },
    engineConfig: structuredClone(config.engineConfig),
    strategyConfig: structuredClone(config.strategyConfig),
  };
}
