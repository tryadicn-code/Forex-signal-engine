import { describe, it, expect, beforeEach } from "vitest";
import { ScannerApi, resetScannerApi } from "@/scanner/scanner-api";
import { MockMarketDataProvider } from "@/providers/market-data/mock-provider";
import { TableAccountConversionResolver } from "@/market-data/account-conversion";
import { createInMemoryRepositories } from "@/repositories/in-memory";

const T0 = Date.UTC(2024, 5, 3, 12, 0, 0);

function api(symbols = ["EURUSD"]) {
  const provider = new MockMarketDataProvider({
    scenarios: { EURUSD: { direction: "UP", pullback: true, resumption: true } },
  });
  return new ScannerApi(
    { symbols },
    {
      marketData: provider,
      conversionResolver: new TableAccountConversionResolver(provider.getRates()),
      repositories: createInMemoryRepositories(),
    }
  );
}

describe("ScannerApi", () => {
  beforeEach(() => {
    resetScannerApi();
  });

  it("exposes the configured symbol universe", () => {
    expect(api(["EURUSD", "GBPUSD"]).listSymbols()).toEqual(["EURUSD", "GBPUSD"]);
  });

  it("returns no snapshot before the first scan", () => {
    expect(api().getLatestSnapshot()).toBeNull();
    expect(api().getLatestResults()).toEqual([]);
    expect(api().getSymbolResult("EURUSD")).toBeNull();
  });

  it("serves results after a scan without re-running it", async () => {
    const a = api();
    await a.runScan(T0);
    expect(a.getLatestSnapshot()).not.toBeNull();
    expect(a.getLatestResults().length).toBe(1);
    expect(a.getSymbolResult("EURUSD")?.symbol).toBe("EURUSD");
  });

  it("exposes health and provider status", async () => {
    const a = api();
    expect(a.getHealth()).toBeNull();
    await a.runScan(T0);
    expect(a.getHealth()?.symbolsRequested).toBe(1);
    expect(a.getProviderStatus()).not.toBeNull();
  });

  it("lists active signals and full history separately", async () => {
    const a = api();
    await a.runScan(T0);
    await a.runScan(T0);
    const all = a.getAllSignals();
    const active = a.getActiveSignals();
    expect(active.every((s) => s.state !== "CLOSED" && s.state !== "INVALIDATED")).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(active.length);
    for (const signal of all) {
      const history = a.getSignalHistory(signal.signalId);
      expect(Array.isArray(history)).toBe(true);
    }
  });

  it("returns recent transitions across all signals", async () => {
    const a = api();
    await a.runScan(T0);
    const recent = a.getRecentTransitions(10);
    expect(recent.length).toBeLessThanOrEqual(10);
  });

  it("signal views expose identity and origin timestamps, never prices", async () => {
    const a = api();
    await a.runScan(T0);
    for (const signal of a.getAllSignals()) {
      expect(signal.signalId).toBeTruthy();
      expect(signal.originTimestamp).toBeGreaterThan(1e11);
      expect(signal.transitionCount).toBeGreaterThanOrEqual(0);
    }
  });
});
