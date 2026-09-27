import { describe, it, expect } from "vitest";
import { computeSignalIdentity } from "@/scanner/signal-lifecycle";

const PIP = 0.0001;
const T1 = Date.UTC(2024, 5, 3, 12, 0, 0);
const T2 = T1 + 60 * 60 * 1000; // one hour later

const base = {
  symbol: "EURUSD",
  direction: "LONG" as const,
  originTimeframe: "H1" as const,
  zoneLow: 1.0820,
  zoneHigh: 1.0860,
  pipSize: PIP,
};

describe("computeSignalIdentity", () => {
  it("produces the same id for the same setup across repeated scans", () => {
    const a = computeSignalIdentity({ ...base, originTimestamp: T1 });
    const b = computeSignalIdentity({ ...base, originTimestamp: T1 });
    expect(a.signalId).toBe(b.signalId);
    expect(a).toEqual(b);
  });

  it("keeps the same id when zone prices differ only by float noise", () => {
    const exact = computeSignalIdentity({ ...base, originTimestamp: T1 });
    const noisy = computeSignalIdentity({
      ...base,
      originTimestamp: T1,
      zoneLow: 1.0820 + 1e-9,
      zoneHigh: 1.0860 - 1e-9,
    });
    expect(noisy.signalId).toBe(exact.signalId);
  });

  it("produces a NEW id when the same zone repeats at a different origin time", () => {
    const earlier = computeSignalIdentity({ ...base, originTimestamp: T1 });
    const later = computeSignalIdentity({ ...base, originTimestamp: T2 });
    expect(earlier.signalId).not.toBe(later.signalId);
  });

  it("changes id when the direction changes", () => {
    const long_ = computeSignalIdentity({ ...base, originTimestamp: T1 });
    const short_ = computeSignalIdentity({
      ...base,
      direction: "SHORT",
      originTimestamp: T1,
    });
    expect(long_.signalId).not.toBe(short_.signalId);
  });

  it("changes id when the symbol changes", () => {
    const eurusd = computeSignalIdentity({ ...base, originTimestamp: T1 });
    const gbpusd = computeSignalIdentity({
      ...base,
      symbol: "GBPUSD",
      originTimestamp: T1,
    });
    expect(eurusd.signalId).not.toBe(gbpusd.signalId);
  });

  it("changes id when the zone bounds change", () => {
    const zone1 = computeSignalIdentity({ ...base, originTimestamp: T1 });
    const zone2 = computeSignalIdentity({
      ...base,
      originTimestamp: T1,
      zoneHigh: 1.0900,
    });
    expect(zone1.signalId).not.toBe(zone2.signalId);
  });

  // P0 regression: originTimestamp must be a real market time, never a price.
  it("records the real setup-origin market timestamp, not a derived price", () => {
    const id = computeSignalIdentity({ ...base, originTimestamp: T1 });
    expect(id.originTimestamp).toBe(T1);
    expect(id.originTimestamp).toBeGreaterThan(0);
    // The interrupted implementation assigned originTimestamp: lowPips, which is
    // a tiny pip count (~10820), not an epoch millisecond.
    expect(id.originTimestamp).toBeGreaterThan(1e11);
  });

  it("quantizes zone bounds into whole pips for float stability", () => {
    const id = computeSignalIdentity({ ...base, originTimestamp: T1 });
    expect(id.zoneLowPips).toBe(Math.round(base.zoneLow / PIP));
    expect(id.zoneHighPips).toBe(Math.round(base.zoneHigh / PIP));
  });

  it("handles JPY pip sizes without colliding with 5-digit pairs", () => {
    const jpy = computeSignalIdentity({
      symbol: "USDJPY",
      direction: "LONG",
      originTimeframe: "H1",
      originTimestamp: T1,
      zoneLow: 149.0,
      zoneHigh: 149.5,
      pipSize: 0.01,
    });
    const eur = computeSignalIdentity({ ...base, originTimestamp: T1 });
    expect(jpy.signalId).not.toBe(eur.signalId);
    expect(jpy.zoneLowPips).toBe(14900);
  });
});
