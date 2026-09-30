import { describe, expect, it } from "vitest";
import { resolveTransactionalConfig } from "@/config/transactional";

describe("Phase 9 transactional configuration", () => {
  it("defaults to Phase 8 local compatibility mode", () => {
    expect(resolveTransactionalConfig({})).toEqual({
      mode: "local",
      requireSharedStore: false,
      remoteUrl: null,
      remoteToken: null,
      requestTimeoutMs: 8000,
      leaseTtlMs: 180000,
      instanceId: null,
    });
  });

  it("parses shared transactional deployment controls", () => {
    expect(
      resolveTransactionalConfig({
        FSE_TX_STORE_MODE: "remote",
        FSE_REQUIRE_SHARED_TX_STORE: "true",
        FSE_TX_STORE_URL: "https://example.test/rest/v1",
        FSE_TX_STORE_TOKEN: "secret",
        FSE_TX_STORE_TIMEOUT_MS: "5000",
        FSE_TX_LEASE_TTL_MS: "240000",
        FSE_INSTANCE_ID: "node-a",
      })
    ).toEqual({
      mode: "remote",
      requireSharedStore: true,
      remoteUrl: "https://example.test/rest/v1",
      remoteToken: "secret",
      requestTimeoutMs: 5000,
      leaseTtlMs: 240000,
      instanceId: "node-a",
    });
  });
});
