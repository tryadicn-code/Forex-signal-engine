import { describe, expect, it } from "vitest";
import { resolveBrokerExecutionConfig } from "@/config/broker";

describe("Phase 10 broker execution configuration", () => {
  it("defaults to fully disabled broker execution", () => {
    const config = resolveBrokerExecutionConfig({});
    expect(config.mode).toBe("off");
    expect(config.providerId).toBe("shadow");
    expect(config.liveExecutionEnabled).toBe(false);
    expect(config.emergencyStop).toBe(true);
    expect(config.approvalSecret).toBeNull();
    expect(config.allowedSymbols).toEqual([]);
    expect(config.maxOrdersPerCycle).toBe(1);
    expect(config.maxOpenPositions).toBe(1);
    expect(config.blockSameSymbolPosition).toBe(true);
  });

  it("parses explicit live hard limits conservatively", () => {
    const config = resolveBrokerExecutionConfig({
      FSE_BROKER_MODE: "live",
      FSE_BROKER_PROVIDER: "mt5",
      FSE_LIVE_EXECUTION_ENABLED: "true",
      FSE_LIVE_EMERGENCY_STOP: "false",
      FSE_LIVE_APPROVAL_SECRET: "secret",
      FSE_LIVE_ALLOWED_SYMBOLS: "EURUSD, GBPUSD,EURUSD",
      FSE_LIVE_MAX_RISK_PERCENT: "0.2",
      FSE_LIVE_MAX_LOT: "0.05",
      FSE_LIVE_MAX_ORDERS_PER_CYCLE: "2",
      FSE_LIVE_MAX_OPEN_POSITIONS: "3",
      FSE_LIVE_MAX_EQUITY_DRAWDOWN_PERCENT: "1.5",
      FSE_LIVE_BLOCK_SAME_SYMBOL_POSITION: "false",
      FSE_LIVE_ARM_MAX_MINUTES: "5",
      FSE_LIVE_ARM_MAX_ORDERS: "2",
    });

    expect(config.mode).toBe("live");
    expect(config.providerId).toBe("mt5");
    expect(config.liveExecutionEnabled).toBe(true);
    expect(config.emergencyStop).toBe(false);
    expect(config.allowedSymbols).toEqual(["EURUSD", "GBPUSD"]);
    expect(config.maxRiskPercent).toBe(0.2);
    expect(config.maxLot).toBe(0.05);
    expect(config.maxOrdersPerCycle).toBe(2);
    expect(config.maxOpenPositions).toBe(3);
    expect(config.maxEquityDrawdownPercent).toBe(1.5);
    expect(config.blockSameSymbolPosition).toBe(false);
  });
});
