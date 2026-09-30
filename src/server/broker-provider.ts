import "server-only";

import { BROKER_EXECUTION_CONFIG } from "@/config/broker";
import type { BrokerProvider } from "@/broker/types";
import { ShadowBrokerProvider } from "@/broker/shadow-provider";
import { Mt5BrokerProvider } from "@/broker/mt5-provider";

type BrokerProviderGlobal = typeof globalThis & {
  __fseBrokerProvider?: BrokerProvider;
};

export function runtimeBrokerProvider(): BrokerProvider {
  const runtime = globalThis as BrokerProviderGlobal;
  if (runtime.__fseBrokerProvider) return runtime.__fseBrokerProvider;

  if (
    BROKER_EXECUTION_CONFIG.providerId === "mt5" &&
    BROKER_EXECUTION_CONFIG.mt5BridgeToken
  ) {
    runtime.__fseBrokerProvider = new Mt5BrokerProvider({
      baseUrl: BROKER_EXECUTION_CONFIG.mt5BridgeUrl,
      token: BROKER_EXECUTION_CONFIG.mt5BridgeToken,
      timeoutMs: BROKER_EXECUTION_CONFIG.mt5RequestTimeoutMs,
    });
  } else {
    runtime.__fseBrokerProvider = new ShadowBrokerProvider();
  }
  return runtime.__fseBrokerProvider;
}
