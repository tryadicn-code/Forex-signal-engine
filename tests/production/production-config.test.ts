import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProductionConfig } from "@/config/production";
import { resolveStoragePaths } from "@/config/storage";

describe("Phase 8 production configuration", () => {
  it("keeps safe development defaults explicit", () => {
    expect(resolveProductionConfig({})).toEqual({
      maintenanceMode: false,
      requireActiveRelease: false,
      requireLiveMarketData: false,
    });
  });

  it("parses production safety flags without loose truthiness", () => {
    expect(
      resolveProductionConfig({
        FSE_MAINTENANCE_MODE: "true",
        FSE_REQUIRE_ACTIVE_RELEASE: "1",
        FSE_REQUIRE_LIVE_MARKET_DATA: "yes",
      })
    ).toEqual({
      maintenanceMode: true,
      requireActiveRelease: true,
      requireLiveMarketData: true,
    });

    expect(
      resolveProductionConfig({
        FSE_MAINTENANCE_MODE: "off",
        FSE_REQUIRE_ACTIVE_RELEASE: "false",
        FSE_REQUIRE_LIVE_MARKET_DATA: "0",
      })
    ).toEqual({
      maintenanceMode: false,
      requireActiveRelease: false,
      requireLiveMarketData: false,
    });
  });

  it("supports moving all production state under one data directory", () => {
    const paths = resolveStoragePaths({
      FSE_DATA_DIR: "/tmp/fse-data",
    });

    const root = path.resolve("/tmp/fse-data");

    expect(paths.dataDirectory).toBe(root);
    expect(paths.paper).toBe(path.join(root, "paper-trading.json"));
    expect(paths.strategyRegistry).toBe(
      path.join(root, "strategy-version-registry.json")
    );
    expect(paths.releaseRuntimeAudit).toBe(
      path.join(root, "release-runtime-audit.json")
    );
    expect(paths.forwardValidation).toBe(
      path.join(root, "forward-validation.json")
    );
    expect(paths.backtestRuns).toBe(path.join(root, "backtest-runs"));
    expect(paths.snapshots).toBe(path.join(root, "snapshots"));
    expect(paths.brokerExecution).toBe(
      path.join(root, "broker-execution.json")
    );
    expect(paths.notifications).toBe(
      path.join(root, "notifications.json")
    );
  });

  it("preserves explicit Paper/forward file overrides inside a custom data root", () => {
    const paths = resolveStoragePaths({
      FSE_DATA_DIR: "/tmp/fse-data",
      FSE_PAPER_STORE_PATH: "/mnt/paper/custom.json",
      FSE_FORWARD_VALIDATION_STORE_PATH: "/mnt/forward/custom.json",
    });

    expect(paths.paper).toBe("/mnt/paper/custom.json");
    expect(paths.forwardValidation).toBe("/mnt/forward/custom.json");
    expect(paths.strategyRegistry).toBe(
      path.join(
        path.resolve("/tmp/fse-data"),
        "strategy-version-registry.json"
      )
    );
  });
});
